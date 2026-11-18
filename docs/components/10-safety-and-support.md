# 10. Safety and support

**Track C** · Owner: ________

Covers SOS, incidents, lost items, trusted contacts, disputes, support tickets, notifications and reminders.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/safety`, `/help`, `/bookings/$id/dispute` |
| Components | `trip-safety-extension.tsx`, `support-ticket-form.tsx`, `notification-bell.tsx` |
| Admin | `/admin`, Disputes, Support Tickets and Reviews tabs |
| Database | `incidents`, `trusted_contacts`, `disputes`, `support_tickets`, `ticket_messages`, `user_reports`, `notifications`, `generate_scheduled_reminders` |

## Rules

- An SOS alerts every admin, with the location when available.
- A lost item report on a booking notifies the host.
- Users see only their own incidents, tickets and notifications.
- Ticket categories are Billing, Roadside, Safety, Account and Other.

## Test accounts

Asha, Hari and Ada, with an active trip for Asha.

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| SS-01 | As Asha, save a trusted contact at `/safety` | `Trusted emergency contact saved!` | |
| SS-02 | During the active trip, press SOS and allow location | Emergency request is registered | |
| SS-03 | As Ada, check notifications | `EMERGENCY SOS Triggered!` shows the coordinates and booking | |
| SS-04 | As Asha, raise a dispute on the booking with photos | Report is received and admins are notified | |
| SS-05 | As Ada, resolve it with notes | Asha is notified with the resolution | |
| SS-06 | As Asha, submit a support ticket at `/help` | Ticket appears with a ticket number | |
| SS-07 | As Ada, reply to the ticket | Asha receives `Support Reply` | |
| SS-08 | As Ada, mark it resolved | Asha receives `Support Ticket Resolved` | |

## Incident cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| SS-09 | Press SOS with location denied | SOS is still recorded | |
| SS-10 | Report an incident while signed out | `Please sign in to report an incident` | |
| SS-11 | Report an incident with no description | `Provide incident description` | |
| SS-12 | File a lost item with no name | `Provide item name` | |
| SS-13 | File a lost item on a booking | Host receives `Lost Item Reported` | |
| SS-14 | Save a contact without a phone number | `Provide contact name and phone number` | |
| SS-15 | Delete a trusted contact | `Emergency contact removed` | |
| SS-16 | Read another user's incidents through the API | No data returned | |

## Dispute and ticket cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| SS-17 | Submit a dispute with no subject | `Add a short subject` | |
| SS-18 | Raise a dispute on someone else's booking through the API | Refused | |
| SS-19 | Read someone else's ticket through the API | No data returned | |
| SS-20 | Resolve a damage dispute that needs compensation | **GAP-13:** money outcome must be supported | |

## Notifications and reminders

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| SS-21 | Trigger a booking event while the other user is online | Bell updates live without a refresh | |
| SS-22 | Open a notification | It links to the right page and is marked read | |
| SS-23 | Have a paid trip starting within 24 h, then run `manage.py send_reminders` | `Trip reminder (24h)` is created | |
| SS-24 | Have a paid trip starting within 2 h, then run it | `Pickup in 2 hours` is created | |
| SS-25 | Run the command twice | No duplicate reminders | |
| SS-26 | Have a licence expiring within 30 days, then run it | `Driving Licence Expiring Soon` is created | |
| SS-27 | Run the reminders with the database in UTC | **GAP-25:** reminder timing must still be correct | |

## Linked gaps

GAP-13, GAP-25
