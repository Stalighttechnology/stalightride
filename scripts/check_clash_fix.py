import sys, os
sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.db import connection

cara_id = 'e7de8090-a418-44cc-afb5-5fb41d41d9b4'
b1 = 'c24886db-3327-4e9f-96b0-79eb24401226'
b2 = '3673b52c-3972-4eac-8fb0-5dc953452cb2'

with connection.cursor() as cursor:
    # See what jobs Cara is currently assigned to
    cursor.execute("""
        SELECT id, slot_date, slot_time, address, status, progress 
        FROM wash_bookings 
        WHERE assigned_cleaner_id = %s AND status NOT IN ('completed', 'cancelled')
    """, [cara_id])
    print('Cara active jobs:')
    for j in cursor.fetchall():
        print(' ', j)

    # Cancel old test jobs that are cluttering Cara's queue
    cursor.execute("""
        UPDATE wash_bookings
        SET status = 'cancelled', progress = 'cancelled'
        WHERE assigned_cleaner_id = %s 
          AND status NOT IN ('completed', 'cancelled')
          AND id NOT IN (%s, %s)
    """, [cara_id, b1, b2])
    print('Cancelled clutter jobs for Cara')

    # Also make sure Cara's radius allows reaching bookings or check distance
    cursor.execute("SELECT public.can_cleaner_see_wash_job(%s, %s)", [cara_id, b1])
    print('After clearing clash -> Can Cara see 10:00 Rajajinagar job:', cursor.fetchone()[0])

    # For Banashankari (8.74 km away), check if Cara's radius was 8 km
    cursor.execute("SELECT radius_km, base_lat, base_lng FROM cleaners WHERE id = %s", [cara_id])
    print('Cara settings:', cursor.fetchone())
