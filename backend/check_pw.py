import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'
import django
django.setup()
from django.db import connection

with connection.cursor() as cur:
    cur.execute("SELECT email, password_hash, roles FROM users WHERE email = 'rushi@lju.edu.in' LIMIT 1")
    r = cur.fetchone()
    if r:
        print('Student Email:', r[0])
        print('password_hash:', repr(r[1]))
        print('Role:', r[2])

    cur.execute("SELECT email, password_hash FROM users WHERE roles = 'faculty' LIMIT 2")
    for row in cur.fetchall():
        print('Faculty:', row[0], '| hash:', repr(row[1]))
