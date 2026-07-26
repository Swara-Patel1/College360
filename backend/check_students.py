import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'
import django
django.setup()
from django.db import connection

with connection.cursor() as cur:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'students' ORDER BY ordinal_position")
    cols = [r[0] for r in cur.fetchall()]
    print('Students columns:', cols)

    cur.execute("SELECT * FROM students LIMIT 1")
    row = cur.fetchone()
    if row:
        print('Sample row:', dict(zip(cols, row)))
