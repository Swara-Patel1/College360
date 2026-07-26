import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'
import django
django.setup()
from django.db import connection

with connection.cursor() as cur:
    cur.execute("SELECT email, password_hash, roles FROM users WHERE email = 'rushi@lju.edu.in' LIMIT 1")
    r = cur.fetchone()
    print('Email:', r[0])
    print('Password hash:', r[1])
    print('Role:', r[2])

    cur.execute("SELECT email, password_hash, roles FROM users WHERE email = 'faculty1@lju.edu.in' LIMIT 1")
    r2 = cur.fetchone()
    if r2:
        print('\nFaculty Email:', r2[0])
        print('Faculty Password hash:', r2[1])
        print('Faculty Role:', r2[2])
    else:
        print('\nfaculty1@lju.edu.in not found')
        cur.execute("SELECT email, password_hash FROM users WHERE roles = 'faculty' LIMIT 2")
        for row in cur.fetchall():
            print('Faculty:', row[0], '|', row[1])
