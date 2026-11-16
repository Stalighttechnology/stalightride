from django.db import migrations

# PR-01.3: Creating a host/vendor profile should grant the 'vendor' role in public.user_roles,
# allowing new hosts to land on /vendor after sign-in and pass role verification.
SQL = r"""
CREATE OR REPLACE FUNCTION public.sync_public_vendor() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.public_vendors (id, business_name, bio, kyc_status, created_at, updated_at)
  VALUES (NEW.id, NEW.business_name, NEW.bio, NEW.kyc_status, NEW.created_at, now())
  ON CONFLICT (id) DO UPDATE SET business_name = EXCLUDED.business_name, bio = EXCLUDED.bio, kyc_status = EXCLUDED.kyc_status, updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'vendor'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

DROP POLICY IF EXISTS "Users can claim vendor role" ON public.user_roles;
CREATE POLICY "Users can claim vendor role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'vendor'::public.app_role);

-- Backfill any existing vendors
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'vendor'::public.app_role
FROM public.vendors
ON CONFLICT (user_id, role) DO NOTHING;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0011_fix_revenue_aggregates")]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]

