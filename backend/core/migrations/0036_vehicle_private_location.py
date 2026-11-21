"""Private pickup location: the exact address and pin are readable only after the host confirms.

- public.address_area(address, city): the locality part of an address ("Indiranagar"),
  without door numbers, numbered streets, PIN codes, plus codes, state or country
- public.vehicle_locations: the exact address, lat and lng, one row per vehicle. Row-level
  security lets the host, admins, and customers with a confirmed or completed booking read it
- trg_vehicles_private_location (BEFORE INSERT OR UPDATE on vehicles): copies the address and
  pin the host enters into vehicle_locations, then leaves only the area and a pin rounded to
  about 1 km on the public vehicles row
- Backfills existing vehicles the same way
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.address_area(_address text, _city text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parts text[];
  kept text[] := '{}';
  city_at integer := 0;
  n integer;
  i integer;
BEGIN
  SELECT array_agg(btrim(x) ORDER BY ord) INTO parts
  FROM regexp_split_to_table(COALESCE(_address, ''), E'[,\\n]') WITH ORDINALITY AS t(x, ord)
  WHERE btrim(x) <> '';
  n := COALESCE(array_length(parts, 1), 0);
  FOR i IN 1..n LOOP
    IF lower(parts[i]) = lower(btrim(COALESCE(_city, ''))) THEN
      city_at := i;
      EXIT;
    END IF;
  END LOOP;
  -- Locality names sit just before the city; state and country come after it.
  FOR i IN 1..(CASE WHEN city_at > 0 THEN city_at - 1 ELSE n END) LOOP
    IF parts[i] !~ '[0-9]' AND lower(parts[i]) <> 'india' THEN
      kept := kept || parts[i];
    END IF;
  END LOOP;
  n := COALESCE(array_length(kept, 1), 0);
  IF n = 0 THEN
    RETURN NULL;
  END IF;
  RETURN array_to_string(kept[greatest(n - 1, 1):n], ', ');
END $$;

CREATE TABLE IF NOT EXISTS public.vehicle_locations (
  vehicle_id uuid PRIMARY KEY
    REFERENCES public.vehicles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  address text,
  lat numeric,
  lng numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_locations_select ON public.vehicle_locations;
CREATE POLICY vehicle_locations_select ON public.vehicle_locations
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.vehicles v
               WHERE v.id = vehicle_locations.vehicle_id AND v.vendor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.bookings b
               WHERE b.vehicle_id = vehicle_locations.vehicle_id
                 AND b.customer_id = auth.uid()
                 AND b.status IN ('confirmed', 'completed'))
  );

-- Writes only go through the trigger below. anon may query but no policy gives it rows.
GRANT SELECT ON TABLE public.vehicle_locations TO anon, authenticated;
GRANT ALL ON TABLE public.vehicle_locations TO service_role;

-- Backfill before the trigger exists, so the exact values are copied first.
INSERT INTO public.vehicle_locations (vehicle_id, address, lat, lng)
SELECT id, address, lat, lng FROM public.vehicles
WHERE address IS NOT NULL OR lat IS NOT NULL OR lng IS NOT NULL
ON CONFLICT (vehicle_id) DO NOTHING;

UPDATE public.vehicles
SET address = public.address_area(address, city),
    lat = round(lat, 2),
    lng = round(lng, 2)
WHERE address IS DISTINCT FROM public.address_area(address, city)
   OR lat IS DISTINCT FROM round(lat, 2)
   OR lng IS DISTINCT FROM round(lng, 2);

CREATE OR REPLACE FUNCTION public.tg_vehicles_private_location() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  changed_address boolean := TG_OP = 'INSERT' OR NEW.address IS DISTINCT FROM OLD.address;
  changed_lat boolean := TG_OP = 'INSERT' OR NEW.lat IS DISTINCT FROM OLD.lat;
  changed_lng boolean := TG_OP = 'INSERT' OR NEW.lng IS DISTINCT FROM OLD.lng;
BEGIN
  IF NOT (changed_address OR changed_lat OR changed_lng) THEN
    RETURN NEW;
  END IF;
  -- The vehicles row-level security check still decides whether this write is allowed;
  -- if it fails, the whole statement and this copy roll back together.
  INSERT INTO public.vehicle_locations AS l (vehicle_id, address, lat, lng)
  VALUES (NEW.id, NEW.address, NEW.lat, NEW.lng)
  ON CONFLICT (vehicle_id) DO UPDATE SET
    address = CASE WHEN changed_address THEN EXCLUDED.address ELSE l.address END,
    lat = CASE WHEN changed_lat THEN EXCLUDED.lat ELSE l.lat END,
    lng = CASE WHEN changed_lng THEN EXCLUDED.lng ELSE l.lng END,
    updated_at = now();
  NEW.address := public.address_area(NEW.address, NEW.city);
  NEW.lat := round(NEW.lat, 2);
  NEW.lng := round(NEW.lng, 2);
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.tg_vehicles_private_location() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_vehicles_private_location ON public.vehicles;
CREATE TRIGGER trg_vehicles_private_location
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicles_private_location();
"""

REVERSE_SQL = r"""
DROP TRIGGER IF EXISTS trg_vehicles_private_location ON public.vehicles;
DROP FUNCTION IF EXISTS public.tg_vehicles_private_location();
UPDATE public.vehicles v SET address = l.address, lat = l.lat, lng = l.lng
FROM public.vehicle_locations l WHERE l.vehicle_id = v.id;
DROP TABLE IF EXISTS public.vehicle_locations;
DROP FUNCTION IF EXISTS public.address_area(text, text);
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0035_pool_request_booking_windows")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
