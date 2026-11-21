import sys, os
sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.db import connection

cara_id = 'e7de8090-a418-44cc-afb5-5fb41d41d9b4'

with connection.cursor() as cursor:
    cursor.execute('''
        SET LOCAL "request.jwt.claim.sub" = %s;
        SET LOCAL ROLE authenticated;
        SELECT id, service_name, slot_date, slot_time, area, distance_km, payout FROM public.wash_job_board();
    ''', [cara_id])
    print('Cara wash_job_board returns:')
    rows = cursor.fetchall()
    for row in rows:
        print(' ', row)
    print(f'Total available requests for Cara: {len(rows)}')
