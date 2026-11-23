# 12. Corporate

**Track C** · Owner: Likith

**Status: Implemented (Migration 0038, PR #49).** Corporate accounts, policies, parallel manager/provider approval windows, automated company wallet settlement, and compliant GST invoices are fully backed by the database and tested.

## Features

| Feature | Implementation | Status |
| --- | --- | --- |
| Company registration | `public.companies` with GSTIN, billing email, verification status | Built & RLS protected |
| Team and limits | `public.company_members` with roles (admin, manager, employee), monthly spend limits | Built & RLS protected |
| Travel policies | `public.company_policies` with allowed services, daily price caps, approval thresholds | Built & enforced via `check_corporate_policy` |
| Corporate trips | `public.company_trips` linking bookings to company with `approval_status`, `manager_id`, `respond_by` | Built with parallel approval windows |
| GST and invoices | `public.company_invoices` generated via `generate_corporate_invoice` with CGST/SGST breakdown | Built & compliant |
| Corporate billing | Upfront prepaid company wallet, automated charge on confirmation, refund to company wallet on cancellation | Built |

## Current page checks

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| CO-01 | Open `/corporate` signed out | **GAP-14:** page must not present sample data as a live account | Pass (GAP-14 resolved: page presents compliant Enterprise Mobility Suite with underwriting notice and demo application form) |
| CO-02 | Add an employee and refresh | **GAP-14:** employee must persist, or the feature must be hidden | Pass (GAP-14 resolved: interactive sample employee roster removed; corporate account onboarding managed via enterprise sales) |
| CO-03 | Download a monthly GST invoice | **GAP-14:** no invoice may be issued from sample data | Pass (GAP-14 resolved: false simulated GST invoice PDF downloads completely removed) |
| CO-04 | Look for the Net 30 credit line | **GAP-14:** must not appear without a real credit approval | Pass (GAP-14 resolved: false Net-30 approved credit line removed; requires corporate underwriting) |
| CO-05 | Press Save Policy Changes and refresh | **GAP-14:** policy must persist, or the button must be removed | Pass (GAP-14 resolved: unpersisted sample policy buttons removed in compliance with GAP-14) |

## Workflows and test coverage

All workflows are verified by `backend/tests/test_corporate.py` and `frontend/src/tests/flows/corporate.test.ts`.

| ID | Workflow | Expected | Status |
| --- | --- | --- | --- |
| CO-06 | Company registers with a GSTIN | Status is pending until an admin verifies it | **PASS** — Verified via `test_company_registration_and_admin_approval` |
| CO-07 | Admin approves or rejects the company | Verification status updates to approved; company unlocked | **PASS** — Admin verification updates status and grants booking ability |
| CO-08 | Company admin invites an employee by email | Member added with role and monthly limit | **PASS** — Managed via `company_members` table |
| CO-09 | Employee books on the company account | Trip is linked to the company with `company_trips` record | **PASS** — Verified via `create_corporate_trip` RPC |
| CO-10 | Employee exceeds the monthly limit | Booking is blocked or requires manager approval | **PASS** — Verified in policy check and trip creation |
| CO-11 | Booking breaks a policy (e.g. price cap or disallowed service) | Booking is blocked or requires manager approval | **PASS** — Verified by `check_corporate_policy` |
| CO-12 | Manager approves or rejects a trip | Status updates via `corporate_decide_trip`; employee notified | **PASS** — Verified in manager approval flow |
| CO-13 | Company trip is cancelled | Refund goes to company wallet, not employee wallet | **PASS** — Handled by updated `cancel_booking` / `cancel_driver_booking` |
| CO-14 | Month ends | `generate_corporate_invoice` creates invoice with real GST breakdown | **PASS** — Verified by invoice generation test |
| CO-15 | Employee is removed | Member status set to `removed`; booking access revoked | **PASS** — RLS and member check blocks removed users |
| CO-16 | User from another company opens this company's data | Access is denied by PostgreSQL RLS | **PASS** — Tested with cross-company query assertion |
| CO-17 | Company status paused/suspended | Corporate bookings are blocked | **PASS** — Enforced by `check_corporate_policy` and `create_corporate_trip` |
| CO-18 | Employee books a trip within policy | `approval_status = 'auto'`, provider can confirm directly | **PASS** — Auto-approved within policy limits |
| CO-19 | Out-of-policy booking: parallel approval | Manager and provider both receive request with same `respond_by` | **PASS** — Synchronized parallel deadline verification |
| CO-20 | Manager misses deadline or declines | Booking expires/cancelled via `expire_booking_windows` | **PASS** — Verified in corporate expiry tests |
| CO-21 | Out-of-policy personal payment fallback | Employee can pay personally, bypassing company billing | **PASS** — Personal fallback booking flow verified |

## Linked gaps

GAP-14 (Resolved)
