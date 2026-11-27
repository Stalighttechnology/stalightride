"""Complete end-to-end audit logging system.

Creates public.system_audit_logs table with RLS, triggers on bookings, driver_bookings,
wash_bookings, wallet_transactions, and withdrawal_requests, plus RPC helper.
"""

from django.db import migrations

SQL = r"""
-- 1. Create audit logs table
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  event_type text NOT NULL,
  category text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  actor_role text,
  ip_address text,
  user_agent text,
  action text NOT NULL,
  target_id text,
  target_type text,
  details jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.system_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.system_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.system_audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON public.system_audit_logs(level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.system_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON public.system_audit_logs(target_id);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. RLS policies
DROP POLICY IF EXISTS "Admins can view system audit logs" ON public.system_audit_logs;
CREATE POLICY "Admins can view system audit logs" ON public.system_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Allow server and triggers to insert system audit logs" ON public.system_audit_logs;
CREATE POLICY "Allow server and triggers to insert system audit logs" ON public.system_audit_logs
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- 3. Stored function to record audit logs safely
CREATE OR REPLACE FUNCTION public.log_system_audit_event(
  p_event_type text,
  p_category text,
  p_action text,
  p_level text DEFAULT 'info',
  p_actor_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL,
  p_ua text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor_id uuid := p_actor_id;
  v_actor_email text := p_actor_email;
BEGIN
  IF v_actor_id IS NULL THEN
    v_actor_id := auth.uid();
  END IF;

  IF v_actor_email IS NULL AND v_actor_id IS NOT NULL THEN
    SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;
  END IF;

  INSERT INTO public.system_audit_logs (
    event_type, category, action, level,
    actor_id, actor_email, actor_role,
    target_id, target_type, details,
    ip_address, user_agent
  ) VALUES (
    p_event_type, p_category, p_action, COALESCE(p_level, 'info'),
    v_actor_id, v_actor_email, p_actor_role,
    p_target_id, p_target_type, COALESCE(p_details, '{}'::jsonb),
    p_ip, p_ua
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4. Automatic database triggers for lifecycle events

-- Bookings Trigger
CREATE OR REPLACE FUNCTION public.trg_audit_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_car text;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT title INTO v_car FROM public.vehicles WHERE id = NEW.vehicle_id;
    INSERT INTO public.system_audit_logs (
      event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
    ) VALUES (
      'booking.created', 'booking', 'info', NEW.customer_id, v_email,
      COALESCE('Rental booking placed for ' || COALESCE(v_car, 'Vehicle'), 'Rental booking created'),
      NEW.id::text, 'booking',
      jsonb_build_object(
        'vehicle_id', NEW.vehicle_id,
        'customer_id', NEW.customer_id,
        'vendor_id', NEW.vendor_id,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'status', NEW.status,
        'total_price', NEW.total_price
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_audit_logs (
        event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
      ) VALUES (
        CASE WHEN NEW.status = 'cancelled' THEN 'booking.cancelled' ELSE 'booking.status_change' END,
        'booking',
        CASE WHEN NEW.status = 'cancelled' THEN 'warning' ELSE 'info' END,
        v_actor, v_email,
        'Rental booking #' || SUBSTRING(NEW.id::text, 1, 8) || ' status transitioned: ' || OLD.status::text || ' -> ' || NEW.status::text,
        NEW.id::text, 'booking',
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'cancellation_reason', NEW.cancellation_reason,
          'cancelled_by', NEW.cancelled_by
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bookings ON public.bookings;
CREATE TRIGGER trg_audit_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_bookings();

-- Driver Bookings Trigger
CREATE OR REPLACE FUNCTION public.trg_audit_driver_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_audit_logs (
      event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
    ) VALUES (
      'driver_hire.created', 'booking', 'info', NEW.customer_id, v_email,
      'Chauffeur driver hire booked (Duration: ' || COALESCE(NEW.rate_type::text, 'daily') || ')',
      NEW.id::text, 'driver_booking',
      jsonb_build_object(
        'driver_id', NEW.driver_id,
        'customer_id', NEW.customer_id,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'pickup_address', NEW.pickup_address,
        'pickup_lat', NEW.pickup_lat,
        'pickup_lng', NEW.pickup_lng,
        'status', NEW.status,
        'total_price', NEW.total_price
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_audit_logs (
        event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
      ) VALUES (
        CASE WHEN NEW.status = 'cancelled' THEN 'driver_hire.cancelled' ELSE 'driver_hire.status_change' END,
        'booking',
        CASE WHEN NEW.status = 'cancelled' THEN 'warning' ELSE 'info' END,
        v_actor, v_email,
        'Driver booking #' || SUBSTRING(NEW.id::text, 1, 8) || ' status transitioned: ' || OLD.status::text || ' -> ' || NEW.status::text,
        NEW.id::text, 'driver_booking',
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'cancellation_reason', NEW.cancellation_reason
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_driver_bookings ON public.driver_bookings;
CREATE TRIGGER trg_audit_driver_bookings
AFTER INSERT OR UPDATE ON public.driver_bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_driver_bookings();

-- Wash Bookings Trigger
CREATE OR REPLACE FUNCTION public.trg_audit_wash_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_audit_logs (
      event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
    ) VALUES (
      'wash_booking.created', 'booking', 'info', NEW.customer_id, v_email,
      'Vehicle doorstep detailing/wash slot booked in ' || COALESCE(NEW.city, 'India'),
      NEW.id::text, 'wash_booking',
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'service_id', NEW.service_id,
        'city', NEW.city,
        'slot_date', NEW.slot_date,
        'slot_time', NEW.slot_time,
        'status', NEW.status,
        'price', NEW.price
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_audit_logs (
        event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
      ) VALUES (
        CASE WHEN NEW.status = 'cancelled' THEN 'wash_booking.cancelled' ELSE 'wash_booking.status_change' END,
        'booking',
        CASE WHEN NEW.status = 'cancelled' THEN 'warning' ELSE 'info' END,
        v_actor, v_email,
        'Wash booking #' || SUBSTRING(NEW.id::text, 1, 8) || ' status transitioned: ' || OLD.status::text || ' -> ' || NEW.status::text,
        NEW.id::text, 'wash_booking',
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'assigned_cleaner_id', NEW.assigned_cleaner_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_wash_bookings ON public.wash_bookings;
CREATE TRIGGER trg_audit_wash_bookings
AFTER INSERT OR UPDATE ON public.wash_bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_wash_bookings();

-- Wallet Transactions Trigger
CREATE OR REPLACE FUNCTION public.trg_audit_wallet_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;

  INSERT INTO public.system_audit_logs (
    event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
  ) VALUES (
    'payment.transaction', 'payment', 'info', NEW.user_id, v_email,
    'Wallet ' || COALESCE(NEW.kind::text, 'transaction') || ' of ₹' || NEW.amount::text || ': ' || COALESCE(NEW.description, 'Ledger entry'),
    NEW.id::text, 'wallet_transaction',
    jsonb_build_object(
      'amount', NEW.amount,
      'kind', NEW.kind,
      'description', NEW.description,
      'booking_id', NEW.booking_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_wallet_transactions ON public.wallet_transactions;
CREATE TRIGGER trg_audit_wallet_transactions
AFTER INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_wallet_transactions();

-- Withdrawals Trigger
CREATE OR REPLACE FUNCTION public.trg_audit_withdrawals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_audit_logs (
      event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
    ) VALUES (
      'payout.requested', 'payment', 'info', NEW.user_id, v_email,
      'Vendor/Driver payout withdrawal requested for ₹' || NEW.amount::text,
      NEW.id::text, 'withdrawal',
      jsonb_build_object(
        'amount', NEW.amount,
        'method', NEW.method,
        'status', NEW.status
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_audit_logs (
        event_type, category, level, actor_id, actor_email, action, target_id, target_type, details
      ) VALUES (
        CASE
          WHEN NEW.status = 'paid' THEN 'payout.processed'
          WHEN NEW.status = 'rejected' THEN 'payout.rejected'
          ELSE 'payout.status_change'
        END,
        'payment',
        CASE WHEN NEW.status = 'rejected' THEN 'warning' ELSE 'info' END,
        v_actor, v_email,
        'Payout withdrawal #' || SUBSTRING(NEW.id::text, 1, 8) || ' for ₹' || NEW.amount::text || ' updated to ' || NEW.status::text,
        NEW.id::text, 'withdrawal',
        jsonb_build_object(
          'amount', NEW.amount,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'reference', NEW.reference
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_withdrawals ON public.withdrawals;
CREATE TRIGGER trg_audit_withdrawals
AFTER INSERT OR UPDATE ON public.withdrawals
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_withdrawals();
"""

REVERSE = r"""
DROP TRIGGER IF EXISTS trg_audit_withdrawals ON public.withdrawals;
DROP FUNCTION IF EXISTS public.trg_audit_withdrawals();

DROP TRIGGER IF EXISTS trg_audit_wallet_transactions ON public.wallet_transactions;
DROP FUNCTION IF EXISTS public.trg_audit_wallet_transactions();

DROP TRIGGER IF EXISTS trg_audit_wash_bookings ON public.wash_bookings;
DROP FUNCTION IF EXISTS public.trg_audit_wash_bookings();

DROP TRIGGER IF EXISTS trg_audit_driver_bookings ON public.driver_bookings;
DROP FUNCTION IF EXISTS public.trg_audit_driver_bookings();

DROP TRIGGER IF EXISTS trg_audit_bookings ON public.bookings;
DROP FUNCTION IF EXISTS public.trg_audit_bookings();

DROP FUNCTION IF EXISTS public.log_system_audit_event;

DROP TABLE IF EXISTS public.system_audit_logs;
"""

class Migration(migrations.Migration):
    dependencies = [("core", "0043_driver_booked_ranges")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
