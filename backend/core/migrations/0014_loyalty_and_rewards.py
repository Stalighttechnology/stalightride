from django.db import migrations

SQL = r"""
CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_id ON public.loyalty_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.claimed_vouchers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    voucher_id text NOT NULL,
    title text NOT NULL,
    code text NOT NULL,
    category text NOT NULL,
    points_cost integer NOT NULL,
    terms text,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active' NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claimed_vouchers_user_id ON public.claimed_vouchers(user_id, claimed_at DESC);

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claimed_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own loyalty ledger" ON public.loyalty_ledger;
CREATE POLICY "User reads own loyalty ledger" ON public.loyalty_ledger
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "User reads own claimed vouchers" ON public.claimed_vouchers;
CREATE POLICY "User reads own claimed vouchers" ON public.claimed_vouchers
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON TABLE public.loyalty_ledger TO authenticated;
GRANT SELECT ON TABLE public.claimed_vouchers TO authenticated;
GRANT ALL ON TABLE public.loyalty_ledger TO service_role;
GRANT ALL ON TABLE public.claimed_vouchers TO service_role;
"""

REVERSE_SQL = r"""
DROP TABLE IF EXISTS public.claimed_vouchers;
DROP TABLE IF EXISTS public.loyalty_ledger;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0013_user_membership")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
