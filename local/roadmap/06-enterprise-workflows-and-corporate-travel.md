# Track 06: Enterprise Workflows & Corporate Travel (From Basics to Master)

In enterprise B2B software, applications must handle corporate hierarchies, policy enforcement, approval state machines, and tax compliance.

---

## 1. The Core Basics (Zero Prerequisites)

### What is Multi-Tenancy?
* In a consumer app, every user operates as an individual.
* In a B2B app, users belong to an Organization or Company. The company has its own billing address, tax ID (GSTIN), shared company wallet, and spending rules that govern all employee bookings.

### What is an Approval Workflow?
When an employee wants to rent a vehicle:
* If the cost is small (e.g. ₹1,500), the system approves it instantly.
* If the cost is high (e.g. ₹8,000) or exceeds policy, it enters a `pending` state awaiting a manager's explicit digital signature.

---

## 2. Intermediate Concepts: State Machines & Timeout Windows

### 2.1 The Approval State Machine
A trip request flows through strict, non-reversible states:
```
[ Request Created ] ──► [ Pending Manager Approval ] ──► [ Approved & Paid ]
                                 │
                                 ├──► [ Rejected by Manager ]
                                 └──► [ Expired (Timeout Window) ]
```

### 2.2 Why Timeout Windows are Critical
If a manager goes on vacation and never answers the approval request, the vehicle remains reserved and unavailable for other paying customers!
Synchoo solves this with **Approval Windows (`respond_by`)**:
* Every approval request has a strict deadline (e.g. 2 hours).
* When `now() > respond_by`, the background runner marks the request `expired`, unlocks the car, and notifies both parties.

---

## 3. Advanced Synchoo Concepts: Policy Engines & GST Rule 46

### 3.1 The Policy Engine (`check_corporate_policy`)
Implemented in Migration `0038_corporate_accounts_and_approval_windows.py`:
1. Validates that the company is active.
2. Checks that the service (`rental`, `driver`, `wash`) is permitted under company policy.
3. Computes the employee's current monthly spend to ensure they have not exceeded their `monthly_limit`.
4. Checks whether the amount exceeds `approval_threshold`.

### 3.2 B2B GST Rule 46 Tax Invoicing
Under Indian CGST Rule 46, companies can claim **Input Tax Credit (ITC)** if invoices include valid GSTINs, HSN/SAC codes, and proper tax breakdowns:
* Same-state rentals: **CGST (9%) + SGST (9%)**.
* Inter-state rentals: **IGST (18%)**.
Synchoo's `generate_corporate_invoice()` RPC automates this calculation at month-end and generates downloadable PDF invoices.

---

## 4. Where This Lives in the Synchoo Codebase

* `backend/core/migrations/0038_corporate_accounts_and_approval_windows.py`: The complete corporate database schema (`companies`, `company_members`, `company_policies`, `company_trips`, `company_invoices`).
* `scripts/generate_synchoo_invoice.py`: PDF invoice generator under CGST Rule 46.
* `frontend/src/tests/flows/corporate.test.ts`: Automated test assertions covering corporate trip policies and approvals.

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn how multi-tenant database models structure organizations, teams, and members.
- [ ] **Step 2:** Model a finite state machine (FSM) in PostgreSQL using `status` enums or check constraints.
- [ ] **Step 3:** Implement timeout logic using timestamp columns (`respond_by`) and scheduled sweep jobs.
- [ ] **Step 4:** Understand GST B2B tax mechanics (CGST, SGST, IGST, and ITC eligibility).
- [ ] **Step 5:** Inspect migration `0038` and trace how `check_corporate_policy()` evaluates budgets.

---

## 6. Curated Learning Resources

* 🔗 [Watch: State Machine Design Pattern & Workflow Engines (Continuous Delivery)](https://www.youtube.com/results?search_query=State+Machine+Design+Pattern+Continuous+Delivery)
  * *Best for:* Structuring state transitions and workflow guards.
* 🔗 [Watch: Multi-Tenant Architecture in Database Design (ByteByteGo)](https://www.youtube.com/results?search_query=ByteByteGo+Multi+Tenant+Architecture)
  * *Best for:* Data isolation strategies for enterprise B2B apps.
* 📖 [Read: ClearTax Invoicing Guide under CGST Rule 46](https://cleartax.in/s/invoicing-rules-gst)
  * *Best for:* Understanding mandatory tax fields and Input Tax Credit calculations.
