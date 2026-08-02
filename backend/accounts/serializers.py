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

        try:
            from django.db import connection
            user_email = instance.email.lower() if instance.email else ''
            user_pk_str = str(instance.pk)
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT h.department_id, d.name FROM hod h JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(h.department_id AS TEXT) WHERE LOWER(u.email) = %s OR CAST(h.user_id AS TEXT) = %s
                    UNION
                    SELECT f.department_id, d.name FROM faculty f JOIN users u ON CAST(u.id AS TEXT) = CAST(f.user_id AS TEXT) JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(f.department_id AS TEXT) WHERE LOWER(u.email) = %s OR CAST(f.user_id AS TEXT) = %s
                    LIMIT 1
                """, [user_email, user_pk_str, user_email, user_pk_str])
                row = cur.fetchone()
                if row:
                    ret['department_id'] = str(row[0]) if row[0] else ''
                    ret['department_name'] = row[1] or ''
                    ret['dept_name'] = row[1] or ''
        except Exception:
            pass

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
    Authenticates user using Django ORM against the 'users' database table.
    Returns JWT access/refresh tokens and user profile payload.
    """
    email = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email_input = data['email'].strip()
        password = data['password']

        user = (User.objects.filter(email__iexact=email_input).first() or 
                User.objects.filter(username__iexact=email_input).first())

        if not user:
            raise serializers.ValidationError({'error': 'invalid_credentials',
                                               'message': 'Invalid email or password.'})

        password_ok = user.check_password(password)
        if not password_ok and user.password == password:
            user.set_password(password)
            user.save(update_fields=['password'])
            password_ok = True

        if not password_ok:
            raise serializers.ValidationError({'error': 'invalid_credentials',
                                               'message': 'Invalid email or password.'})

        if not user.is_active:
            raise serializers.ValidationError({'error': 'account_disabled',
                                               'message': 'Account is disabled.'})

        first_name = user.first_name
        last_name = user.last_name
        if not first_name:
            prefix = user.email.split('@')[0] if user.email else user.username
            parts = prefix.replace('.', ' ').replace('_', ' ').split()
            first_name = parts[0].capitalize() if parts else 'User'
            last_name = ' '.join(p.capitalize() for p in parts[1:]) if len(parts) > 1 else ''

        refresh = RefreshToken.for_user(user)
        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': str(user.pk),
                'email': user.email,
                'username': user.username or user.email,
                'first_name': first_name,
                'last_name': last_name,
                'role': (user.role or 'student').lower(),
                'phone': user.phone or '',
                'is_active': user.is_active,
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
