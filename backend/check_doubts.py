import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'
import django
django.setup()
from django.db import connection

with connection.cursor() as cur:
    # Check enum values for doubt_status_enum
    cur.execute("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'doubt_status_enum'::regtype ORDER BY enumsortorder")
    vals = [r[0] for r in cur.fetchall()]
    print('doubt_status_enum values:', vals)

    # Check a sample row from doubts
    cur.execute("SELECT doubt_id, status, assigned_faculty_id FROM doubts LIMIT 5")
    for r in cur.fetchall():
        print('Row:', r)
