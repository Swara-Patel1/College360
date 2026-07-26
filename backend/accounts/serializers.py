from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'phone', 'address', 'date_of_birth', 'profile_pic',
                  'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        first_name = ret.get('first_name')
        last_name = ret.get('last_name')
        try:
            if not first_name and hasattr(instance, 'student_profile') and instance.student_profile:
                first_name = instance.student_profile.first_name
                last_name = instance.student_profile.last_name
            elif not first_name and hasattr(instance, 'faculty_profile') and instance.faculty_profile:
                first_name = instance.faculty_profile.first_name
                last_name = instance.faculty_profile.last_name
        except Exception:
            pass

        if not first_name:
            prefix = instance.email.split('@')[0] if instance.email else instance.username
            parts = prefix.replace('.', ' ').replace('_', ' ').split()
            first_name = parts[0].capitalize() if parts else 'User'
            last_name = ' '.join(p.capitalize() for p in parts[1:]) if len(parts) > 1 else ''

        ret['first_name'] = first_name
        ret['last_name'] = last_name
        return ret


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name',
                  'password', 'password2', 'role', 'phone']

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError("Passwords do not match.")
        return data

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    """
    Authenticates against the raw PostgreSQL 'users' table (not Django's accounts_user).
    Looks up names from the students or faculty tables.
    Returns access/refresh tokens and full user object matching frontend shape.
    """
    email = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        from django.db import connection

        email_input = data['email'].strip()
        password = data['password']

        # --- Step 1: Authenticate against the raw 'users' table ---
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT id, email, password_hash, roles, is_active FROM users WHERE email ILIKE %s LIMIT 1',
                [email_input]
            )
            row = cursor.fetchone()

        if not row:
            raise serializers.ValidationError({'error': 'invalid_credentials',
                                               'message': 'Invalid email or password.'})

        raw_id, raw_email, raw_password_hash, raw_role, raw_is_active = row

        # Compare password — supports both plaintext and bcrypt hashes
        password_ok = False
        if raw_password_hash:
            if raw_password_hash.startswith('$2b$') or raw_password_hash.startswith('$2a$'):
                # bcrypt hash — use passlib or check_password
                try:
                    import bcrypt
                    password_ok = bcrypt.checkpw(password.encode('utf-8'), raw_password_hash.encode('utf-8'))
                except ImportError:
                    # Fallback: try Django's check_password with the hash
                    from django.contrib.auth.hashers import check_password as dj_check
                    password_ok = dj_check(password, raw_password_hash)
            elif raw_password_hash.startswith('pbkdf2_') or raw_password_hash.startswith('argon2'):
                # Django-style hash
                from django.contrib.auth.hashers import check_password as dj_check
                password_ok = dj_check(password, raw_password_hash)
            else:
                # Plaintext comparison
                password_ok = (raw_password_hash == password)
        
        if not password_ok:
            raise serializers.ValidationError({'error': 'invalid_credentials',
                                               'message': 'Invalid email or password.'})

        if not raw_is_active:
            raise serializers.ValidationError({'error': 'account_disabled',
                                               'message': 'Account is disabled.'})

        # --- Step 2: Lookup name from students or faculty table ---
        first_name = ''
        last_name = ''
        role = (raw_role or 'student').lower()

        with connection.cursor() as cursor:
            if role == 'student':
                cursor.execute(
                    'SELECT first_name, last_name, enrollment_no FROM students WHERE user_id = %s LIMIT 1',
                    [str(raw_id)]
                )
                name_row = cursor.fetchone()
                if name_row:
                    first_name, last_name, _ = name_row
            elif role in ('faculty', 'hod'):
                cursor.execute(
                    'SELECT first_name, last_name FROM faculty WHERE user_id = %s LIMIT 1',
                    [str(raw_id)]
                )
                name_row = cursor.fetchone()
                if name_row:
                    first_name, last_name = name_row

        # Fallback: derive name from email prefix
        if not first_name:
            prefix = raw_email.split('@')[0]
            parts = prefix.replace('.', ' ').replace('_', ' ').split()
            first_name = parts[0].capitalize() if parts else 'User'
            last_name = ' '.join(p.capitalize() for p in parts[1:]) if len(parts) > 1 else ''

        # --- Step 3: Get or create the matching Django accounts_user ---
        # We sync a minimal Django user so JWT can reference user_id
        try:
            django_user = User.objects.get(email__iexact=raw_email)
        except User.DoesNotExist:
            django_user = User(
                username=raw_email,
                email=raw_email,
                first_name=first_name,
                last_name=last_name,
                role=role,
                is_active=True,
            )
            django_user.set_unusable_password()
            django_user.save()

        # Always keep name/role in sync with the source of truth
        updated = False
        if django_user.first_name != first_name or django_user.last_name != last_name:
            django_user.first_name = first_name
            django_user.last_name = last_name
            updated = True
        if django_user.role != role:
            django_user.role = role
            updated = True
        if updated:
            django_user.save(update_fields=['first_name', 'last_name', 'role'])

        # --- Step 4: Issue JWT ---
        refresh = RefreshToken.for_user(django_user)
        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': str(raw_id),          # use real users.id (UUID)
                'email': raw_email,
                'username': raw_email,
                'first_name': first_name,
                'last_name': last_name,
                'role': role,
                'phone': '',
                'is_active': raw_is_active,
            }
        }



class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
