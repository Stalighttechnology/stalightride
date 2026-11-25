# Track 04: FinTech Payments, Consistency & Idempotency (From Basics to Master)

In financial applications, bugs are not just glitches—they mean real monetary loss or legal liability. Synchoo is designed to be mathematically consistent and immune to double-charges.

---

## 1. The Core Basics (Zero Prerequisites)

### How Online Payments Work
When you buy something on an app with UPI or a Card:
1. **Your App (Frontend):** Asks the backend to create an "order".
2. **Payment Gateway (Razorpay):** Pops up a secure screen asking for your UPI PIN or Card OTP.
3. **The Bank:** Confirms that the money moved from your account to Razorpay.
4. **The Callback / Webhook:** Razorpay tells your backend: *"Payment successful! Here is proof."*

### Why Double-Spending Happens Without Idempotency
Imagine tapping "Pay ₹2,000" on a moving train with weak Wi-Fi:
* The phone sends the request, but the screen freezes.
* You nervously tap "Pay ₹2,000" two more times.
* Without protection, the server processes three separate payments, deducting ₹6,000 instead of ₹2,000!

---

## 2. Intermediate Concepts: Idempotency Keys & HMAC Signatures

### 2.1 What is an Idempotency Key?
An **Idempotency Key** is a unique receipt number generated for an operation. 
* Formula: $\text{Result}(f(x)) = \text{Result}(f(f(x)))$
* When the server sees a request with an idempotency key it already processed, it **does not re-charge or re-insert**. It simply returns the existing successful confirmation!

### 2.2 Cryptographic HMAC Verification
Never trust the browser when it says: *"Hey server, the user paid ₹5,000!"* A hacker could modify that JavaScript message.
Instead, Razorpay generates a cryptographic hash using a secret key only the backend and Razorpay share:
$$\text{Signature} = \text{HMAC-SHA256}(\text{order\_id} + "|" + \text{payment\_id}, \text{SECRET\_KEY})$$
In [`backend/payments/views.py`](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/payments/views.py), Synchoo computes this signature independently and performs a constant-time comparison (`hmac.compare_digest`).

---

## 3. Advanced Synchoo Concepts: Double-Entry Ledgers & Auto-Refunds

### 3.1 Double-Entry Bookkeeping (`wallet_apply`)
In Synchoo, user balances are never modified with a simple `SET balance = 500`.
Every coin moving in or out must create an immutable audit record in `wallet_transactions`:

```sql
CREATE FUNCTION public.wallet_apply(...) ...
BEGIN
  -- 1. Atomic in-place balance calculation
  UPDATE public.wallets SET balance = balance + _amount WHERE user_id = _user_id;
  
  -- 2. Business Invariant: Balance can NEVER drop below zero!
  IF new_balance < 0 THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  
  -- 3. Permanent Audit Ledger Entry
  INSERT INTO public.wallet_transactions (user_id, amount, kind, balance_after, ...)
  VALUES (_user_id, _amount, _kind, new_balance, ...);
END;
```

### 3.2 Asynchronous Webhook Reconciler & Late-Payment Refunds
* **The Webhook Safety Net:** If the customer closes their browser immediately after entering their UPI PIN, the browser callback never fires! Razorpay's server sends an asynchronous webhook to `/api/fn/razorpay_webhook/`, ensuring the booking is confirmed anyway.
* **Late-Payment Auto-Refund:** If the customer took 45 minutes to pay and the booking expired in the meantime, Synchoo's webhook immediately detects the closed booking and **automatically refunds 100% of the money back to the customer's wallet**.

---

## 4. Where This Lives in the Synchoo Codebase

* `backend/payments/views.py`: `create_razorpay_order`, `verify_razorpay_payment`, `verify_wallet_topup`, and `razorpay_webhook`.
* `backend/sql/schema.sql`: `public.wallet_apply()`, `public.wallet_pay_booking()`, and the `wallets` / `wallet_transactions` tables.
* `frontend/src/lib/actions.ts`: Client wrappers for payment functions (`createRazorpayOrder`, `verifyRazorpayPayment`).
* `frontend/src/routes/_authenticated/wallet.tsx`: Customer wallet UI showing balance and transaction history.

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn how online payment gateways (Stripe/Razorpay) operate (Orders, Payments, Signatures).
- [ ] **Step 2:** Understand the Idempotency Key pattern and why it is mandatory for `POST` requests.
- [ ] **Step 3:** Implement an HMAC-SHA256 signature verification function in Python.
- [ ] **Step 4:** Build a simple double-entry ledger table in PostgreSQL (`user_id`, `amount`, `balance_after`, `timestamp`).
- [ ] **Step 5:** Understand how Webhooks handle asynchronous events and how to make them idempotent.
- [ ] **Step 6:** Inspect `verify_wallet_topup` in `backend/payments/views.py` and observe `FOR UPDATE` in action.

---

## 6. Curated Learning Resources

* 🔗 [Watch: What is API Idempotency and Why Is It Important? (ByteByteGo)](https://www.youtube.com/results?search_query=ByteByteGo+What+is+API+Idempotency)
  * *Best for:* Visualizing network retries and idempotency key workflows.
* 🔗 [Watch: Design a Payment System (Stripe / PayPal Architecture) (ByteByteGo)](https://www.youtube.com/results?search_query=Design+a+Payment+System+System+Design+Interview)
  * *Best for:* End-to-end FinTech system design.
* 🔗 [Watch: Designing a Double-Entry Ledger System (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+Double+Entry+Ledger)
  * *Best for:* Understanding ledger invariants and append-only financial records.
* 📖 [Read: Razorpay Official Integration Architecture](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/)
