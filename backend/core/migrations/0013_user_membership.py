from django.db import migrations

SQL = r"""
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_plan text DEFAULT 'free' NOT NULL,
  ADD COLUMN IF NOT EXISTS membership_cycle text DEFAULT 'monthly' NOT NULL,
  ADD COLUMN IF NOT EXISTS membership_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS membership_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS membership_auto_renew boolean DEFAULT true NOT NULL;

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind = ANY (ARRAY['topup'::text, 'booking_payment'::text, 'booking_earning'::text, 'refund'::text, 'payout'::text, 'adjustment'::text, 'driver_payment'::text, 'driver_earning'::text, 'driver_refund'::text, 'driver_refund_reversal'::text, 'wash_payment'::text, 'wash_refund'::text, 'payout_reversal'::text, 'promo_credit'::text, 'wash_earning'::text, 'referral_bonus'::text, 'membership_payment'::text]));

CREATE OR REPLACE FUNCTION public.tg_guard_profile_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.referral_rewarded := OLD.referral_rewarded;

  NEW.membership_plan := OLD.membership_plan;
  NEW.membership_cycle := OLD.membership_cycle;
  NEW.membership_started_at := OLD.membership_started_at;
  NEW.membership_expires_at := OLD.membership_expires_at;

  IF NEW.dl_status = 'pending'
     OR (NEW.dl_number, NEW.dl_expiry, NEW.dl_front_url, NEW.dl_back_url)
        IS DISTINCT FROM (OLD.dl_number, OLD.dl_expiry, OLD.dl_front_url, OLD.dl_back_url) THEN
    NEW.dl_status := 'pending';
    NEW.dl_verified_at := NULL;
    NEW.dl_rejection_reason := NULL;
  ELSE
    NEW.dl_status := OLD.dl_status;
    NEW.dl_verified_at := OLD.dl_verified_at;
    NEW.dl_rejection_reason := OLD.dl_rejection_reason;
  END IF;
  RETURN NEW;
END; $$;
"""

REVERSE_SQL = r"""
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS membership_plan,
  DROP COLUMN IF EXISTS membership_cycle,
  DROP COLUMN IF EXISTS membership_started_at,
  DROP COLUMN IF EXISTS membership_expires_at,
  DROP COLUMN IF EXISTS membership_auto_renew;
"""

class Migration(migrations.Migration):
    dependencies = [("core", "0012_auto_vendor_role")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
