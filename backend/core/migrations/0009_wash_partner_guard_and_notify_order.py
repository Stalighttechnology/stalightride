from django.db import migrations

# WA wave 2 (1): cleaners and washing centers could approve themselves (and set their own rating), because
# their "manage own profile" policies let them write every column. Approval stays with verify_cleaner() /
# verify_wash_center() and admins; editing a rejected profile sends it back for review.
SQL = r"""
CREATE OR REPLACE FUNCTION public.tg_guard_wash_partner_verification() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Two IFs on purpose, as in tg_money_guard_booking: service-role callers never reach has_role().
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.avg_rating := 0;
    NEW.review_count := 0;
    RETURN NEW;
  END IF;

  NEW.avg_rating := OLD.avg_rating;
  NEW.review_count := OLD.review_count;
  IF OLD.verification_status = 'rejected' THEN
    NEW.verification_status := 'pending';  -- resubmitting after a rejection
    NEW.rejection_reason := NULL;
  ELSE
    NEW.verification_status := OLD.verification_status;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_cleaner_verification ON public.cleaners;
CREATE TRIGGER trg_guard_cleaner_verification BEFORE INSERT OR UPDATE ON public.cleaners
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_wash_partner_verification();
DROP TRIGGER IF EXISTS trg_guard_wash_center_verification ON public.wash_centers;
CREATE TRIGGER trg_guard_wash_center_verification BEFORE INSERT OR UPDATE ON public.wash_centers
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_wash_partner_verification();

-- Cancelling, rejecting or completing a wash changes only status; progress stays 'confirmed'. The old
-- branch order matched progress = 'confirmed' first, so those customers were told "Wash slot approved —
-- pay now" instead of cancelled/unavailable/completed. Terminal statuses now come first, and each
-- message fires only on the change that causes it.
CREATE OR REPLACE FUNCTION public.tg_notify_wash_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('New wash request',
      NEW.city || ' · ' || NEW.slot_date || ' ' || NEW.slot_time || ' — assign a washer partner.', '/admin');
    PERFORM public.notify_user(NEW.customer_id, 'Wash requested', 'Our team is checking washer availability.', '/washes');
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash slot unavailable',
      COALESCE(NEW.rejection_reason, 'No washer partner is free for that slot.'), '/wash');
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash cancelled',
      CASE WHEN NEW.refund_amount > 0 THEN 'Refund of Rs ' || NEW.refund_amount || ' credited to your wallet.' ELSE 'Your wash booking was cancelled.' END, '/washes');
  ELSIF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash completed', 'Your vehicle is sparkling. View your invoice.', '/washes');
  ELSIF NEW.progress = 'on_the_way' AND OLD.progress IS DISTINCT FROM 'on_the_way' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Cleaner on the way', 'Your cleaner is heading to your address.', '/washes');
  ELSIF NEW.progress = 'started' AND OLD.progress IS DISTINCT FROM 'started' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash started', 'Your vehicle wash is now in progress.', '/washes');
  ELSIF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash slot approved', 'Pay now to confirm your doorstep wash.', '/washes');
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash payment successful', 'Your slot is locked in.', '/washes');
  END IF;

  RETURN NEW;
END; $$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0008_guard_hire_status")]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]
