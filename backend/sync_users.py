"""
Sync users from the raw PostgreSQL `users` table into Django's `accounts_user` table.
This is needed because `accounts_user` was newly created by migrations while data lived in `users`.
"""
import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'

import django
django.setup()

from django.db import connection
from django.contrib.auth.hashers import make_password
from accounts.models import User

# Common default passwords by role (for dev/demo purposes)
ROLE_PASSWORDS = {
    'admin':   'admin123',
    'faculty': 'fac123',
    'student': 'student123',
    'parent':  'parent123',
    'hod':     'hod123',
}

with connection.cursor() as cur:
    cur.execute("""
        SELECT id, email, password_hash, roles, is_active
        FROM users
        ORDER BY email
    """)
    raw_users = cur.fetchall()

print(f"Found {len(raw_users)} users in raw `users` table")

created = 0
skipped = 0

for uid, email, pw_hash, role, is_active in raw_users:
    if User.objects.filter(email=email).exists():
        skipped += 1
        continue

    role_clean = (role or 'student').lower()
    username = email.split('@')[0]
    
    # Try to get name from students/faculty table
    first_name, last_name = '', ''
    with connection.cursor() as cur:
        if role_clean == 'student':
            cur.execute("SELECT first_name, last_name FROM students WHERE user_id = %s LIMIT 1", [str(uid)])
            r = cur.fetchone()
            if r:
                first_name, last_name = r[0] or '', r[1] or ''
        elif role_clean in ('faculty', 'hod'):
            cur.execute("SELECT first_name, last_name FROM faculty WHERE user_id = %s LIMIT 1", [str(uid)])
            r = cur.fetchone()
            if r:
                first_name, last_name = r[0] or '', r[1] or ''

    # Use default password for the role
    default_pw = ROLE_PASSWORDS.get(role_clean, 'password123')
    
    try:
        u = User(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            role=role_clean,
            is_active=bool(is_active),
            is_staff=(role_clean == 'admin'),
        )
        u.set_password(default_pw)
        u.save()
        created += 1
        if created % 50 == 0:
            print(f"  Created {created} users so far...")
    except Exception as e:
        print(f"  ERROR creating {email}: {e}")

print(f"\nDone! Created: {created}, Skipped (already existed): {skipped}")
print(f"Total accounts_user rows: {User.objects.count()}")
