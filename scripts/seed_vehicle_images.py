import os
import sys
import uuid
import time
import json
import urllib.request
import io
from pathlib import Path
from PIL import Image

sys.path.insert(0, os.path.abspath('backend'))
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.db import connection

# Master source image sets
IMAGE_SETS = {
    "activa": [
        {
            "id": "activa_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/2/29/Honda_Activa_Rental-_Goa_1.jpg",
            "title": "Honda Activa Front 3/4"
        },
        {
            "id": "activa_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/9/9f/Honda_Activa_Rental-_Goa_2.jpg",
            "title": "Honda Activa Side View"
        },
        {
            "id": "activa_3",
            "url": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Honda_Activa_Rental-_Goa_4.jpg",
            "title": "Honda Activa Front"
        },
        {
            "id": "activa_4",
            "url": "https://upload.wikimedia.org/wikipedia/commons/a/a5/Honda_Activa_Rental-_Goa_6.jpg",
            "title": "Honda Activa Rear 3/4"
        },
    ],
    "ertiga": [
        {
            "id": "ertiga_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/0/01/Maruti_Suzuki_Ertiga%281%29.jpg",
            "title": "Maruti Ertiga Front 3/4"
        },
        {
            "id": "ertiga_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/4/45/Maruti_Suzuki_Ertiga%282%29.jpg",
            "title": "Maruti Ertiga Side"
        },
        {
            "id": "ertiga_3",
            "url": "https://upload.wikimedia.org/wikipedia/commons/6/62/Maruti_Suzuki_Ertiga%283%29.jpg",
            "title": "Maruti Ertiga Angle"
        },
        {
            "id": "ertiga_4",
            "url": "https://upload.wikimedia.org/wikipedia/commons/e/e4/2013_Suzuki_Ertiga_1.4_GX_wagon_%28ZE81S%3B_01-20-2019%29%2C_South_Tangerang.jpg",
            "title": "Suzuki Ertiga GX Wagon"
        },
    ],
    "swift_white": [
        {
            "id": "swift_white_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/1/19/2019_Suzuki_Swift_Attitude_Dualjet_1.2_Front.jpg",
            "title": "White Swift Front"
        },
        {
            "id": "swift_white_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/1/13/2019_Suzuki_Swift_Attitude_Dualjet_1.2_Rear.jpg",
            "title": "White Swift Rear"
        },
    ],
    "swift_red": [
        {
            "id": "swift_red_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/9/9a/2018_Suzuki_Swift_SZ5_Boosterjet_SHVS_1.0_Front.jpg",
            "title": "Red Swift Front"
        },
        {
            "id": "swift_red_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Maruti_Suzuki_Swift_2092.JPG",
            "title": "Red Swift Angle"
        },
        {
            "id": "swift_red_3",
            "url": "https://upload.wikimedia.org/wikipedia/commons/8/86/Maruti_Suzuki_Swift_2093.JPG",
            "title": "Red Swift Side"
        },
    ],
    "swift_silver": [
        {
            "id": "swift_silver_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/b/b7/Suzuki_Swift_1.2_GLS_2018.jpg",
            "title": "Silver Swift Front 3/4"
        },
        {
            "id": "swift_silver_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/b/b8/Suzuki_Swift_1.2_GLS_2019_%2850836753151%29.jpg",
            "title": "Silver Swift Profile"
        },
    ],
    "swift_blue": [
        {
            "id": "swift_blue_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/3/3d/Suzuki_Swift_1.2_GLX_2018_%2839796731854%29.jpg",
            "title": "Blue Swift Front 3/4"
        },
        {
            "id": "swift_blue_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/4/43/Maruti_Suzuki_Swift_4456.JPG",
            "title": "Swift Hatchback"
        },
    ],
    "swift_yellow": [
        {
            "id": "swift_yellow_1",
            "url": "https://upload.wikimedia.org/wikipedia/commons/e/ec/2021_Suzuki_Swift_Sport_1.4_auto_yellow_front_view_in_Brunei.jpg",
            "title": "Yellow Swift Sport Front"
        },
        {
            "id": "swift_yellow_2",
            "url": "https://upload.wikimedia.org/wikipedia/commons/e/e5/2021_Suzuki_Swift_Sport_1.4_auto_yellow_rear_view_in_Brunei.jpg",
            "title": "Yellow Swift Sport Rear"
        },
        {
            "id": "swift_yellow_3",
            "url": "https://upload.wikimedia.org/wikipedia/commons/6/60/2021_Suzuki_Swift_Sport_1.4_auto_yellow_interior_view_in_Brunei.jpg",
            "title": "Yellow Swift Sport Interior"
        },
    ],
}

CACHE_DIR = Path("scratch/vehicle_images_cache")
MEDIA_BASE = Path("backend/media/vehicle-images")

HEADERS = {
    'User-Agent': 'SynchooPlatform/1.0 (https://synchoo.com; dev@synchoo.com) python-urllib/3.13',
    'Accept': 'image/webp,image/jpeg,image/png,*/*'
}

def download_and_optimize(item):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{item['id']}.jpg"
    if cache_path.exists() and cache_path.stat().st_size > 1000:
        return cache_path

    print(f"Downloading {item['title']} from {item['url']}...")
    time.sleep(0.5)
    req = urllib.request.Request(item['url'], headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read()

    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    # Resize keeping aspect ratio, max 1600x1200
    img.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
    img.save(cache_path, "JPEG", quality=85, optimize=True)
    print(f"Saved optimized image to {cache_path} ({cache_path.stat().st_size} bytes)")
    return cache_path

def seed_all_vehicles():
    print("Pre-caching all vehicle images...")
    cached = {}
    for group_name, items in IMAGE_SETS.items():
        cached[group_name] = []
        for it in items:
            try:
                p = download_and_optimize(it)
                cached[group_name].append(p)
            except Exception as e:
                print(f"Warning: Failed to download {it['title']}: {e}")

    swift_groups = ["swift_white", "swift_red", "swift_silver", "swift_blue", "swift_yellow"]
    swift_group_idx = 0

    with connection.cursor() as cur:
        cur.execute('''
            SELECT id, vendor_id, title, category, brand, model
            FROM public.vehicles
            ORDER BY category, brand, model, title;
        ''')
        vehicles = cur.fetchall()
        print(f"\nProcessing {len(vehicles)} vehicles in database...")

        total_seeded = 0
        for vid, vendor_id, title, category, brand, model in vehicles:
            vid_str = str(vid)
            vendor_str = str(vendor_id)
            print(f"\nVehicle: [{category}] {brand} {model} - '{title}' ({vid_str})")

            cat_lower = str(category).lower()
            model_lower = str(model).lower()
            
            if cat_lower == "scooter" or "activa" in model_lower:
                images_to_use = cached.get("activa", [])
            elif "ertiga" in model_lower:
                images_to_use = cached.get("ertiga", [])
            else:
                chosen_group = swift_groups[swift_group_idx % len(swift_groups)]
                swift_group_idx += 1
                images_to_use = cached.get(chosen_group, [])
                if not images_to_use:
                    for g in swift_groups:
                        if cached.get(g):
                            images_to_use = cached[g]
                            break

            target_dir = MEDIA_BASE / vendor_str / vid_str
            target_dir.mkdir(parents=True, exist_ok=True)

            # Clear old image records for this vehicle
            cur.execute("DELETE FROM public.vehicle_images WHERE vehicle_id = %s;", [vid])

            for sort_order, src_img_path in enumerate(images_to_use):
                filename = f"img_{sort_order}.jpg"
                dest_path = target_dir / filename
                with open(src_img_path, "rb") as f_in, open(dest_path, "wb") as f_out:
                    f_out.write(f_in.read())

                storage_name = f"{vendor_str}/{vid_str}/{filename}"

                # Insert into storage.objects
                cur.execute('''
                    INSERT INTO storage.objects (bucket_id, name, owner)
                    VALUES ('vehicle-images', %s, %s)
                    ON CONFLICT (bucket_id, name) DO NOTHING;
                ''', [storage_name, vendor_id])

                # Insert into public.vehicle_images
                cur.execute('''
                    INSERT INTO public.vehicle_images (id, vehicle_id, url, sort_order)
                    VALUES (gen_random_uuid(), %s, %s, %s);
                ''', [vid, storage_name, sort_order])

                total_seeded += 1
                print(f"  + Added image {sort_order}: {storage_name} ({dest_path.stat().st_size} bytes)")

        # Verification summary
        cur.execute('''
            SELECT v.id, v.title, v.model, COUNT(vi.id)
            FROM public.vehicles v
            LEFT JOIN public.vehicle_images vi ON vi.vehicle_id = v.id
            GROUP BY v.id, v.title, v.model
            ORDER BY v.model, v.title;
        ''')
        summary = cur.fetchall()
        print("\n================ FINAL VERIFICATION ================")
        print(f"Total vehicles: {len(summary)}")
        print(f"Total images assigned: {total_seeded}")
        all_good = True
        for row in summary:
            print(f" - {row[1]} ({row[2]}): {row[3]} image(s)")
            if row[3] == 0:
                all_good = False

        if all_good:
            print("\nSUCCESS: All vehicles have images!")
        else:
            print("\nWARNING: Some vehicles do not have images!")

if __name__ == '__main__':
    seed_all_vehicles()
