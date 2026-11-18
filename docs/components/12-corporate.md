# 12. Corporate

**Track C** · Owner: ________

**Status: demo only (GAP-14).** The page at `/corporate` runs entirely in the browser with sample data. It has no database tables or backend, and refreshing the page resets it.

## What the page shows today

| Screen | Today | Problem |
| --- | --- | --- |
| Company registration | Stored in page memory | Nothing is saved or verified |
| Overview | Sample spend for "Acme Technologies" | Figures are not real |
| Team and limits | Sample employees | Limits are not enforced on bookings |
| Corporate trips | Sample trips | Not linked to real bookings |
| GST and invoices | Sample invoices that download as PDFs | Described as official tax invoices, but not real |
| Credit line | "Net 30 (Approved)" and ₹5,00,000 | No credit process exists |
| Travel policies | Save shows a success message | Nothing is saved |

## Do this first

Before any public launch, choose one:

| Option | What it means |
| --- | --- |
| **Hide it** (recommended for the first launch) | Remove the page from navigation and show a "contact us" form |
| **Label it** | Keep the demo with a clear banner, and remove invoice downloads and the credit line |
| **Build it** | Complete the scope below |

Until it is real, the page must not offer downloadable tax invoices or claim approved credit.

## Current page checks

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| CO-01 | Open `/corporate` signed out | **GAP-14:** page must not present sample data as a live account | |
| CO-02 | Add an employee and refresh | **GAP-14:** employee must persist, or the feature must be hidden | |
| CO-03 | Download a monthly GST invoice | **GAP-14:** no invoice may be issued from sample data | |
| CO-04 | Look for the Net 30 credit line | **GAP-14:** must not appear without a real credit approval | |
| CO-05 | Press Save Policy Changes and refresh | **GAP-14:** policy must persist, or the button must be removed | |

## Scope to build

### Suggested data

| Table | Purpose |
| --- | --- |
| `companies` | Legal name, GSTIN, billing email, city, verification status, credit limit |
| `company_members` | User, company, role, department, monthly limit, status |
| `company_policies` | Allowed services, price caps, approval thresholds |
| `company_trips` | Links each rental, hire or wash to a company, with approval status |
| `company_invoices` | Month, base, GST, total, status, invoice number |

Add every table through a migration, with row-level security so each company sees only its own data.

### Workflows to specify and test

| ID | Workflow | Expected |
| --- | --- | --- |
| CO-06 | Company registers with a GSTIN | Status is pending until an admin verifies it |
| CO-07 | Admin approves or rejects the company | Company admin is notified |
| CO-08 | Company admin invites an employee by email | Employee accepts and joins |
| CO-09 | Employee books on the company account | Trip is linked to the company |
| CO-10 | Employee exceeds the monthly limit | Booking is blocked or sent for approval |
| CO-11 | Booking breaks a policy | Booking is blocked or sent for approval |
| CO-12 | Manager approves or rejects a trip | Employee is notified |
| CO-13 | Company trip is cancelled | Refund goes to the company, not the employee |
| CO-14 | Month ends | One invoice is created from real trips, with correct GST |
| CO-15 | Employee is removed | They can no longer book on the company account |
| CO-16 | User from another company opens this company's data | Access is denied |
| CO-17 | Invoice is unpaid past its due date | Company booking is paused |

### Decisions needed before building

1. Does the company pay upfront, from a company wallet, or on monthly credit?
2. Who approves credit, and what are the limits?
3. What must a tax invoice contain? Have an accountant confirm the GST treatment and format.
4. Does each employee still need an approved driving licence? For self-drive rentals, assume yes.
5. Is pooling included, given that passengers pay drivers directly?

## Linked gaps

GAP-14
