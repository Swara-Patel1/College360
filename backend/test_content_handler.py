import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'college_management.settings'

import django
django.setup()

from django.db import connection

with connection.cursor() as cur:
    cur.execute("SELECT id FROM users WHERE email = 'rushi@lju.edu.in'")
    r = cur.fetchone()
    print('Anika user id:', r)
    uid = str(r[0]) if r else None

    if uid:
        cur.execute('SELECT s.student_id FROM students s JOIN users u ON u.id = s.user_id WHERE CAST(u.id AS TEXT) = %s LIMIT 1', [uid])
        sr = cur.fetchone()
        print('Student row:', sr)
        if sr:
            student_id = str(sr[0])
            cur.execute('SELECT DISTINCT department_id, semester_id FROM enrollments WHERE student_id = %s', [student_id])
            pairs = cur.fetchall()
            print('Enrollment dept+sem pairs:', len(pairs))

            if pairs:
                conds = ' OR '.join(['(sub2.department_id = %s AND sub2.semester_id = %s)'] * len(pairs))
                args = [val for p in pairs for val in p]
                cur.execute(f'SELECT subject_id FROM subjects sub2 WHERE {conds}', args)
                sids = [str(r[0]) for r in cur.fetchall()]
                print('Enrolled subject_ids count:', len(sids))

                if sids:
                    phs = ', '.join(['%s'] * len(sids))
                    cur.execute(f'SELECT c.content_id, c.title, c.content_type, sub.code FROM content c LEFT JOIN subjects sub ON sub.subject_id = c.subject_id WHERE c.subject_id IN ({phs})', sids)
                    content_rows = cur.fetchall()
                    print('Matching content rows:', len(content_rows))
                    for c in content_rows:
                        print(' -', c)
