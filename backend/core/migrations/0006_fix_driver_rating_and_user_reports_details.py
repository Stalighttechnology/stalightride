"""Fix driver avg_rating/review_count recomputation and add details column to user_reports."""

from django.db import migrations

SQL = """
CREATE OR REPLACE FUNCTION public.enforce_driver_verification_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('app.recomputing_driver_rating', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    IF NEW.verification_status = 'approved' THEN
      NEW.verified_at = COALESCE(NEW.verified_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.status := 'draft';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.avg_rating := 0;
    NEW.review_count := 0;
    RETURN NEW;
  END IF;

  -- Re-submitting documents sends the profile back for review
  IF (NEW.dl_front_url IS DISTINCT FROM OLD.dl_front_url)
     OR (NEW.dl_back_url IS DISTINCT FROM OLD.dl_back_url)
     OR (NEW.id_document_url IS DISTINCT FROM OLD.id_document_url)
     OR (NEW.dl_number IS DISTINCT FROM OLD.dl_number) THEN
    NEW.verification_status := 'pending';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  NEW.avg_rating := OLD.avg_rating;
  NEW.review_count := OLD.review_count;

  IF NEW.verification_status IS DISTINCT FROM 'approved' AND NEW.status = 'active' THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.recompute_driver_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE did UUID;
BEGIN
  did := COALESCE(NEW.driver_id, OLD.driver_id);
  PERFORM set_config('app.recomputing_driver_rating', '1', true);
  UPDATE public.drivers SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.driver_reviews WHERE driver_id = did), 0),
    review_count = (SELECT COUNT(*) FROM public.driver_reviews WHERE driver_id = did)
  WHERE id = did;
  PERFORM set_config('app.recomputing_driver_rating', '0', true);
  UPDATE public.public_drivers SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.driver_reviews WHERE driver_id = did), 0),
    review_count = (SELECT COUNT(*) FROM public.driver_reviews WHERE driver_id = did)
  WHERE id = did;
  RETURN NEW;
END; $$;

ALTER TABLE public.user_reports ADD COLUMN IF NOT EXISTS details text;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0005_fix_wash_booking_enum_casts")]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]
