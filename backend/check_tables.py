import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'

import django
django.setup()

from django.db import connection

with connection.cursor() as cur:
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'accounts_user' ORDER BY ordinal_position")
    print('accounts_user columns:')
    for r in cur.fetchall():
        print(' -', r[0], ':', r[1])

    cur.execute("SELECT COUNT(*) FROM users")
    print('users table count:', cur.fetchone()[0])
    
    cur.execute("SELECT id, email, roles, is_active FROM users LIMIT 3")
    cols = [d[0] for d in cur.description]
    for r in cur.fetchall():
        print(dict(zip(cols, r)))
