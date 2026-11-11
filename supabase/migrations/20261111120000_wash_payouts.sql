-- Wash provider payouts on top of main's wash pipeline (20261107130500 .. 20261107135000).
-- Replaces the payout half of the dropped 20261107130000_wash_pipeline.sql:
-- that file's own pipeline (cleaner_id, progress text, wash_vendors.owner_id,
-- advance_wash_job) lost to main's design in the merge.
--
-- In main's design a washing center is a wash_centers row whose id is the
-- owner's user id, mirrored into wash_vendors with the same id on approval.
-- So wash_bookings.assigned_vendor_id is the center's user id when the job
-- belongs to a center, and a platform partner's id otherwise.

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind = ANY (ARRAY[
    'topup','booking_payment','booking_earning','refund','payout','adjustment',
    'driver_payment','driver_earning','driver_refund','driver_refund_reversal',
    'wash_payment','wash_refund','payout_reversal','promo_credit','wash_earning'
  ]));

-- Credited to the cleaner, else the center, when a paid wash completes (by
-- the provider or an admin). Platform partners that are not a registered
-- center: the platform keeps it.
CREATE OR REPLACE FUNCTION public.tg_wash_settle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payee uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    payee := COALESCE(NEW.assigned_cleaner_id,
                      (SELECT id FROM public.wash_centers WHERE id = NEW.assigned_vendor_id));
    IF payee IS NOT NULL AND payee <> NEW.customer_id AND COALESCE(NEW.provider_earning, 0) > 0 THEN
      PERFORM public.wallet_apply(payee, NEW.provider_earning, 'wash_earning', NULL, NEW.id::text,
        'Earning from completed wash (after commission)');
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_wash_settle ON public.wash_bookings;
CREATE TRIGGER trg_wash_settle BEFORE UPDATE ON public.wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_wash_settle();

CREATE OR REPLACE FUNCTION public.withdrawable_balance(_user uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := COALESCE(_user, auth.uid()); bal numeric; earned numeric; withdrawn numeric;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  IF uid <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT COALESCE(balance, 0) INTO bal FROM public.wallets WHERE user_id = uid;
  SELECT COALESCE(sum(amount), 0) INTO earned FROM public.wallet_transactions
   WHERE user_id = uid AND kind IN ('booking_earning','driver_earning','driver_refund_reversal','wash_earning');
  SELECT COALESCE(sum(amount), 0) INTO withdrawn FROM public.withdrawals
   WHERE user_id = uid AND status <> 'rejected';
  RETURN GREATEST(0, LEAST(COALESCE(bal, 0), earned - withdrawn));
END; $$;

-- Same as phase 1, plus cleaners and washing centers may withdraw.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount numeric, _method text, _upi_id text DEFAULT NULL, _account_name text DEFAULT NULL,
  _account_number text DEFAULT NULL, _ifsc text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s RECORD; avail numeric; wid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.cleaners WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.wash_centers WHERE id = uid) THEN
    RAISE EXCEPTION 'Only hosts, drivers, cleaners and washing centers can withdraw earnings';
  END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = 1;
  _amount := round(COALESCE(_amount, 0), 2);
  IF _amount < COALESCE(s.min_withdrawal, 0) OR _amount <= 0 THEN
    RAISE EXCEPTION 'Minimum withdrawal is Rs %', s.min_withdrawal;
  END IF;

  -- Serialise concurrent requests from the same user.
  PERFORM 1 FROM public.wallets WHERE user_id = uid FOR UPDATE;
  avail := public.withdrawable_balance(uid);
  IF _amount > avail THEN RAISE EXCEPTION 'You can withdraw at most Rs %', avail; END IF;

  IF _method = 'upi' THEN
    IF COALESCE(btrim(_upi_id), '') !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID';
    END IF;
  ELSIF _method = 'bank' THEN
    IF COALESCE(btrim(_account_name), '') = '' THEN RAISE EXCEPTION 'Enter the account holder name'; END IF;
    IF COALESCE(btrim(_account_number), '') !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid account number'; END IF;
    IF upper(COALESCE(btrim(_ifsc), '')) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid IFSC code'; END IF;
  ELSE
    RAISE EXCEPTION 'Choose UPI or bank transfer';
  END IF;

  INSERT INTO public.withdrawals (user_id, amount, method, upi_id, account_name, account_number, ifsc)
  VALUES (uid, _amount, _method,
          CASE WHEN _method = 'upi' THEN btrim(_upi_id) END,
          CASE WHEN _method = 'bank' THEN btrim(_account_name) END,
          CASE WHEN _method = 'bank' THEN btrim(_account_number) END,
          CASE WHEN _method = 'bank' THEN upper(btrim(_ifsc)) END)
  RETURNING id INTO wid;

  PERFORM public.wallet_apply(uid, -_amount, 'payout', NULL, wid::text, 'Withdrawal requested');
  PERFORM public.notify_admins('New withdrawal request', 'Rs ' || _amount || ' via ' || _method || ' — review in Payouts.', '/admin');
  RETURN wid;
END; $$;

REVOKE ALL ON FUNCTION public.tg_wash_settle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdrawable_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdrawable_balance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text, text, text) TO authenticated;
