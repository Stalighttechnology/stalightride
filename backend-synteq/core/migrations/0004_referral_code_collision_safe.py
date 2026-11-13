"""Make public.tg_generate_referral_code() collision-safe for UUIDs sharing prefixes."""

from django.db import migrations

SQL = """
CREATE OR REPLACE FUNCTION public.tg_generate_referral_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  candidate text;
  attempt int := 0;
BEGIN
  IF NEW.referral_code IS NULL THEN
    LOOP
      IF attempt = 0 THEN
        candidate := 'SYN-' || upper(substring(md5(NEW.id::text) from 1 for 12));
      ELSE
        candidate := 'SYN-' || upper(substring(md5(NEW.id::text || ':' || attempt::text || ':' || random()::text) from 1 for 12));
      END IF;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE referral_code = candidate
      );
      attempt := attempt + 1;
    END LOOP;
    NEW.referral_code := candidate;
  END IF;
  RETURN NEW;
END;
$$;
"""

REVERSE = """
CREATE OR REPLACE FUNCTION public.tg_generate_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'SYN-' || upper(substring(NEW.id::text from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0003_admin_read_booking_locations")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
