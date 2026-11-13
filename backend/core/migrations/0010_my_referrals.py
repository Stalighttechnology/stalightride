from django.db import migrations

# WA-10.2: /referrals listed invited friends with SELECT ... FROM profiles WHERE referred_by = me, but
# profiles' row-level security shows each user only their own row, so the list was always empty.
# This returns just the caller's own referrals, with nothing beyond what the page shows.
SQL = r"""
CREATE OR REPLACE FUNCTION public.my_referrals()
    RETURNS TABLE (id uuid, full_name text, created_at timestamptz, referral_rewarded boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.created_at, p.referral_rewarded
    FROM public.profiles p
   WHERE auth.uid() IS NOT NULL AND p.referred_by = auth.uid()
   ORDER BY p.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.my_referrals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_referrals() TO authenticated;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0009_wash_partner_guard_and_notify_order")]
    operations = [migrations.RunSQL(SQL, "DROP FUNCTION IF EXISTS public.my_referrals();")]
