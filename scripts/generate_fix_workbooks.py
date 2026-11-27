import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

base_dir = 'local/fixes'
os.makedirs(f'{base_dir}/part-1-security-auth-concurrency', exist_ok=True)
os.makedirs(f'{base_dir}/part-2-enterprise-billing-corporate', exist_ok=True)
os.makedirs(f'{base_dir}/part-3-devops-infra-production', exist_ok=True)

def create_feedback_sheet(filepath, part_title, part_code, items):
    wb = openpyxl.Workbook()
    # Summary sheet
    ws_sum = wb.active
    ws_sum.title = 'Summary'
    ws_sum.views.sheetView[0].showGridLines = True
    
    # Fonts & Fills
    title_font = Font(name='Segoe UI', size=16, bold=True, color='FFFFFF')
    section_font = Font(name='Segoe UI', size=12, bold=True, color='1E293B')
    hdr_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
    regular_font = Font(name='Segoe UI', size=10, color='1E293B')
    bold_font = Font(name='Segoe UI', size=10, bold=True, color='1E293B')
    
    title_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
    hdr_fill = PatternFill(start_color='334155', end_color='334155', fill_type='solid')
    alt_fill = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')
    
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    
    # Header Banner in Summary
    ws_sum.merge_cells('A1:E2')
    cell = ws_sum['A1']
    cell.value = f'Synchoo Fix Feedback & Verification — {part_title}'
    cell.font = title_font
    cell.fill = title_fill
    cell.alignment = Alignment(horizontal='center', vertical='center')
    
    ws_sum['A4'] = 'Total Proposed Fixes:'
    ws_sum['A4'].font = bold_font
    ws_sum['B4'] = len(items)
    ws_sum['B4'].font = bold_font
    
    ws_sum['A5'] = 'Part Code:'
    ws_sum['A5'].font = bold_font
    ws_sum['B5'] = part_code
    ws_sum['B5'].font = regular_font
    
    ws_sum['A6'] = 'Overall Status:'
    ws_sum['A6'].font = bold_font
    ws_sum['B6'] = 'Pending Review & Approval'
    ws_sum['B6'].font = Font(name='Segoe UI', size=10, bold=True, color='B45309')
    
    ws_sum['A8'] = 'Severity Breakdown'
    ws_sum['A8'].font = section_font
    ws_sum['A9'] = 'Severity'
    ws_sum['B9'] = 'Count'
    ws_sum['A9'].font = hdr_font
    ws_sum['B9'].font = hdr_font
    ws_sum['A9'].fill = hdr_fill
    ws_sum['B9'].fill = hdr_fill
    
    sev_counts = {}
    for item in items:
        sev = item['severity']
        sev_counts[sev] = sev_counts.get(sev, 0) + 1
        
    row_idx = 10
    for sev, cnt in sorted(sev_counts.items()):
        ws_sum[f'A{row_idx}'] = sev
        ws_sum[f'B{row_idx}'] = cnt
        ws_sum[f'A{row_idx}'].font = regular_font
        ws_sum[f'B{row_idx}'].font = regular_font
        ws_sum[f'A{row_idx}'].border = thin_border
        ws_sum[f'B{row_idx}'].border = thin_border
        row_idx += 1
        
    ws_sum.column_dimensions['A'].width = 25
    ws_sum.column_dimensions['B'].width = 30
    ws_sum.column_dimensions['C'].width = 20
    ws_sum.column_dimensions['D'].width = 20
    ws_sum.column_dimensions['E'].width = 20
    
    # Detailed Checklist Sheet
    ws_chk = wb.create_sheet(title='Fix Feedback Checklist')
    ws_chk.views.sheetView[0].showGridLines = True
    
    headers = [
        'Fix ID',
        'Area / Subsystem',
        'Dossier Ref',
        'Fix Title',
        'Severity',
        'Current Defect / Gap Behavior',
        'Proposed Technical Fix',
        'Affected Components & Files',
        'Tester Verification Steps',
        'Status',
        'Actual Tester Result',
        'Tester Comments & Notes'
    ]
    
    for col_idx, h in enumerate(headers, start=1):
        c = ws_chk.cell(row=1, column=col_idx, value=h)
        c.font = hdr_font
        c.fill = hdr_fill
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = thin_border
        
    ws_chk.row_dimensions[1].height = 28
    
    status_fills = {
        'Pass': PatternFill(start_color='DCFCE7', end_color='DCFCE7', fill_type='solid'),
        'Fail': PatternFill(start_color='FEE2E2', end_color='FEE2E2', fill_type='solid'),
        'Pending': PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid'),
        'Blocked': PatternFill(start_color='E2E8F0', end_color='E2E8F0', fill_type='solid'),
    }
    status_fonts = {
        'Pass': Font(name='Segoe UI', size=10, bold=True, color='15803D'),
        'Fail': Font(name='Segoe UI', size=10, bold=True, color='B91C1C'),
        'Pending': Font(name='Segoe UI', size=10, bold=True, color='B45309'),
        'Blocked': Font(name='Segoe UI', size=10, bold=True, color='475569'),
    }
    
    for r_idx, item in enumerate(items, start=2):
        row_vals = [
            item['id'],
            item['subsystem'],
            item['dossier_ref'],
            item['title'],
            item['severity'],
            item['current_defect'],
            item['proposed_fix'],
            item['affected_files'],
            item['verification_steps'],
            item.get('status', 'Pending'),
            item.get('actual_result', ''),
            item.get('notes', '')
        ]
        
        is_alt = (r_idx % 2 == 1)
        for col_idx, val in enumerate(row_vals, start=1):
            c = ws_chk.cell(row=r_idx, column=col_idx, value=val)
            c.font = regular_font
            c.border = thin_border
            c.alignment = Alignment(vertical='top', wrap_text=True)
            if col_idx == 10:  # Status column
                st = val if val in status_fills else 'Pending'
                c.fill = status_fills[st]
                c.font = status_fonts[st]
                c.alignment = Alignment(horizontal='center', vertical='top')
            elif is_alt:
                c.fill = alt_fill
                
        ws_chk.row_dimensions[r_idx].height = 65
        
    col_widths = {
        1: 15,  # Fix ID
        2: 18,  # Area
        3: 16,  # Dossier Ref
        4: 26,  # Fix Title
        5: 12,  # Severity
        6: 35,  # Current Defect
        7: 38,  # Proposed Fix
        8: 30,  # Affected Files
        9: 38,  # Verification Steps
        10: 14, # Status
        11: 30, # Actual Result
        12: 30  # Notes
    }
    for col_idx, w in col_widths.items():
        ws_chk.column_dimensions[get_column_letter(col_idx)].width = w
        
    wb.save(filepath)
    print(f'Saved workbook: {filepath}')

part1_items = [
    {
        'id': 'FIX-01-SEC-01',
        'subsystem': 'Security & Auth',
        'dossier_ref': '01-auth-rbac, AP-07.8',
        'title': 'Incident Reporting Cross-User Abuse & Notification Spam',
        'severity': 'Critical',
        'current_defect': 'public.incidents RLS allows any authenticated user to file lost_item/accident reports against any foreign booking ID, spamming unrelated hosts.',
        'proposed_fix': 'Harden public.incidents INSERT RLS policy: require reporter to be customer or vehicle vendor/driver of the booking. Add database trigger check.',
        'affected_files': 'backend/sql/schema.sql, backend/core/migrations/0041_incident_and_storage_security.py',
        'verification_steps': '1. In psql, authenticate as user A. 2. Attempt INSERT into incidents referencing booking owned by user B. 3. Confirm insert fails with RLS permission denied error.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Directly remediates AP-07.8 identified during wave 3 testing.'
    },
    {
        'id': 'FIX-01-SEC-02',
        'subsystem': 'Storage Security',
        'dossier_ref': '01-auth-rbac, AP-07.5',
        'title': 'Unapproved Vehicle Images Public Storage Leak',
        'severity': 'High',
        'current_defect': 'Unapproved vehicle images can be retrieved via /api/storage/file/vehicle-images/... before vehicle KYC verification is approved by admin.',
        'proposed_fix': 'Enforce can_read_vehicle_image() check in public_file() view handler; ensure only vehicles with status=active and verification_status=approved serve photos to anon.',
        'affected_files': 'backend/files/views.py, backend/sql/schema.sql',
        'verification_steps': '1. Upload vehicle as host without admin approval. 2. Copy image URL. 3. In incognito window, request image URL. 4. Verify 404/403 is returned.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Directly remediates AP-07.5 identified in wave 3.'
    },
    {
        'id': 'FIX-01-CONC-01',
        'subsystem': 'Concurrency Engine',
        'dossier_ref': '04-concurrency-and-async',
        'title': 'Mathematical Double-Booking Exclusion Constraint',
        'severity': 'Critical',
        'current_defect': 'Double booking prevention currently relies exclusively on prevent_booking_conflict trigger, vulnerable to race conditions under concurrent sub-millisecond API hits.',
        'proposed_fix': 'Add btree_gist extension and PostgreSQL EXCLUDE USING gist (vehicle_id WITH =, tstzrange(start_date, end_date, "[)") WITH &&) constraint plus FOR UPDATE pessimistic locking.',
        'affected_files': 'backend/core/migrations/0042_exclude_double_booking_gist.py, backend/payments/views.py',
        'verification_steps': '1. Run scripts/test_simultaneous_booking.py with 10 parallel threads. 2. Verify exactly 1 booking succeeds and 9 fail with exclusion conflict.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Aligns database with Chapter 04 mathematical concurrency blueprint.'
    },
    {
        'id': 'FIX-01-SEC-03',
        'subsystem': 'Data Privacy',
        'dossier_ref': '01-auth-rbac, CU-08.2',
        'title': 'Account Deletion Storage & Media Disk Purge',
        'severity': 'Medium',
        'current_defect': 'delete_my_account_data() anonymizes table records but leaves uploaded Aadhaar, driving licences, and avatars orphaned on disk in MEDIA_ROOT.',
        'proposed_fix': 'Extend delete_my_account_data() or attach file cleanup signal to remove user folder from MEDIA_ROOT and delete storage.objects records.',
        'affected_files': 'backend/core/views.py, backend/files/views.py, backend/accounts/views.py',
        'verification_steps': '1. Sign up test user, upload avatar & license. 2. Call /api/rpc/delete_my_account_data. 3. Verify media directory under MEDIA_ROOT/<uid> is deleted.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Ensures complete GDPR / India DPDP Act compliance.'
    },
    {
        'id': 'FIX-01-HOST-01',
        'subsystem': 'Host Management',
        'dossier_ref': '01-auth-rbac, PR-01.12',
        'title': 'Vehicle Hard vs Soft Deletion State Consistency',
        'severity': 'Medium',
        'current_defect': 'Deleting vehicle with past bookings pauses vehicle and hides locally, but vehicle can reappear under browse or cache invalidations.',
        'proposed_fix': 'Enforce persistent is_deleted=true flag across all query views and RPC filters; add check preventing host from unpausing a soft-deleted vehicle.',
        'affected_files': 'backend/core/query.py, backend/sql/schema.sql, frontend/src/routes/_authenticated/vendor.index.tsx',
        'verification_steps': '1. Delete vehicle with existing booking. 2. Verify is_deleted is true in db. 3. Refresh page and verify vehicle never appears in catalog or host fleet.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Remediates PR-01.12 fleet management defect.'
    }
]

create_feedback_sheet(f'{base_dir}/part-1-security-auth-concurrency/FIX_FEEDBACK_PART_1.xlsx', 'Part 1: Security, Auth & Concurrency', 'PART-1', part1_items)

part2_items = [
    {
        'id': 'FIX-02-CORP-01',
        'subsystem': 'Corporate Travel',
        'dossier_ref': '05-corporate-travel, GAP-14',
        'title': 'Corporate Checkout Integration in Consumer Booking Flows',
        'severity': 'Critical',
        'current_defect': 'Corporate management UI exists at /corporate, but consumer booking sheets (vehicle.$id, driver.$id, wash) only support personal wallet or Razorpay.',
        'proposed_fix': 'Detect active company_memberships on booking sheets. Offer "Pay with Corporate Account", invoke check_corporate_policy() RPC, and record company_trips row.',
        'affected_files': 'frontend/src/routes/vehicle.$id.tsx, frontend/src/routes/driver.$id.tsx, frontend/src/routes/wash.tsx, frontend/src/components/booking-summary-sheet.tsx',
        'verification_steps': '1. As corporate employee, book vehicle. 2. Select "Corporate Account". 3. Verify check_corporate_policy auto-approves or routes to manager queue.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Completes end-to-end Enterprise Mobility flow from Dossier Chapter 05.'
    },
    {
        'id': 'FIX-02-CORP-02',
        'subsystem': 'Enterprise Billing',
        'dossier_ref': '05-corporate-travel',
        'title': 'Automated Corporate GST Rule 46 Monthly Invoicing Cron',
        'severity': 'High',
        'current_defect': 'Monthly corporate billing requires manual script run (generate_synchoo_invoice.py). No automated cron exists to aggregate trips and issue company_invoices.',
        'proposed_fix': 'Create generate_monthly_corporate_invoices() management command & RPC. Aggregate month trips, compute CGST/SGST/IGST, generate PDF, and save invoice record.',
        'affected_files': 'backend/payments/management/commands/generate_corporate_invoices.py, scripts/generate_synchoo_invoice.py',
        'verification_steps': '1. Run generate_corporate_invoices for past month. 2. Verify company_invoices record created. 3. Download generated PDF and verify GST Rule 46 fields.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Mandatory for enterprise B2B customers claiming input tax credit (ITC).'
    },
    {
        'id': 'FIX-02-DRV-01',
        'subsystem': 'Driver Experience',
        'dossier_ref': '06-frontend-ui, PR-03.9',
        'title': 'Driver Dashboard Review Replies & Public Display',
        'severity': 'Medium',
        'current_defect': 'Host review replies were implemented in migration 0040, but driver dashboard has no UI or RPC to respond to customer driver reviews.',
        'proposed_fix': 'Add driver_reply column to driver_reviews table; create driver_reply_to_review RPC; add reply modal dialog to driver-dashboard.tsx.',
        'affected_files': 'backend/core/migrations/0043_driver_review_reply.py, frontend/src/routes/_authenticated/driver-dashboard.tsx',
        'verification_steps': '1. As driver, view review in dashboard. 2. Click "Reply". 3. Submit reply and verify reply appears under driver profile on /driver/$id.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Remediates PR-03.9 from testing wave 3.'
    },
    {
        'id': 'FIX-02-WSH-01',
        'subsystem': 'Cleaner Experience',
        'dossier_ref': '06-frontend-ui, PR-05.7, PR-05.11',
        'title': 'Cleaner Real-Time Appointments & Service Proof Photos',
        'severity': 'Medium',
        'current_defect': 'Cleaner console displays hardcoded sample schedule items and stock proof photos instead of fetching real assigned wash_bookings.',
        'proposed_fix': 'Connect cleaner console to real wash_bookings where cleaner_id = auth.uid(); enable camera/file upload for before/after inspection photos.',
        'affected_files': 'frontend/src/routes/_authenticated/cleaner-dashboard.tsx, backend/payments/views.py',
        'verification_steps': '1. Assign cleaner to wash booking. 2. Open cleaner dashboard. 3. Verify real booking details appear in schedule. 4. Upload proof photo and verify.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Remediates PR-05.7 and PR-05.11.'
    },
    {
        'id': 'FIX-02-HIR-01',
        'subsystem': 'Driver Hire',
        'dossier_ref': '03-payments, CU-04.9',
        'title': 'Driver Cancellation 0% Refund Badging Correction',
        'severity': 'Low',
        'current_defect': 'When a driver booking is cancelled within 0% refund window (<2h), receipt and UI badges display "Partly refunded" with ₹0 instead of "Non-refundable".',
        'proposed_fix': 'Update refund badging logic in receipt/$kind/$id.tsx and hires.tsx to display "Cancelled — Non-refundable" when refund amount is 0.',
        'affected_files': 'frontend/src/routes/_authenticated/receipt.$kind.$id.tsx, frontend/src/routes/_authenticated/hires.tsx',
        'verification_steps': '1. Fast-forward driver hire to within 1h of start. 2. Cancel hire. 3. Check receipt. Verify badge reads "Cancelled — Non-refundable (0% refund)".',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Remediates CU-04.9.'
    },
    {
        'id': 'FIX-02-MKT-01',
        'subsystem': 'Pitch & Public Assets',
        'dossier_ref': '00-executive-summary, AGENTS.md',
        'title': 'Executive Pitch Deck Web & PDF Asset Synchronization',
        'severity': 'Low',
        'current_defect': 'Public pitch copy in frontend/src/content/pitch.json and generated PDF at frontend/public/downloads/synchoo-enterprise-pitch.pdf must remain strictly aligned.',
        'proposed_fix': 'Run scripts/generate-pitch.py; verify diagrams, market stats, and B2B corporate value proposition in pitch.json match generated downloadable PDF.',
        'affected_files': 'frontend/src/content/pitch.json, scripts/generate-pitch.py, frontend/public/downloads/synchoo-enterprise-pitch.pdf',
        'verification_steps': '1. Run python scripts/generate-pitch.py. 2. Verify PDF compiles cleanly. 3. Verify /pitch download button serves the updated PDF.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Enforces mandatory AGENTS.md rule.'
    }
]

create_feedback_sheet(f'{base_dir}/part-2-enterprise-billing-corporate/FIX_FEEDBACK_PART_2.xlsx', 'Part 2: Marketplace, Corporate & Provider Experience', 'PART-2', part2_items)

part3_items = [
    {
        'id': 'FIX-03-OPS-01',
        'subsystem': 'Containerization',
        'dossier_ref': '07-infrastructure-docker-redis',
        'title': 'Production Multi-Container Docker Compose Suite',
        'severity': 'Critical',
        'current_defect': 'No docker-compose.yml, backend/Dockerfile, or frontend/Dockerfile exist in repository despite being detailed in Chapter 07.',
        'proposed_fix': 'Implement production docker-compose.yml (PostgreSQL 17, Redis 7, Daphne ASGI, Nginx, Cron Worker) and multi-stage Dockerfiles for backend and frontend.',
        'affected_files': 'docker-compose.yml, backend/Dockerfile, frontend/Dockerfile, .dockerignore',
        'verification_steps': '1. Run docker compose config to validate YAML syntax. 2. Run docker compose build --dry-run or verify container definitions.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Fulfills Dossier Chapter 07 production deployment blueprint.'
    },
    {
        'id': 'FIX-03-OPS-02',
        'subsystem': 'Caching & Pub/Sub',
        'dossier_ref': '07-infrastructure-docker-redis',
        'title': 'Redis Caching & Django Channels Redis Layer Integration',
        'severity': 'High',
        'current_defect': 'backend/config/settings.py lacks CACHES and CHANNEL_LAYERS configuration, forcing in-memory channels and preventing multi-worker Daphne scaling.',
        'proposed_fix': 'Configure django_redis cache backend and channels_redis.core.RedisChannelLayer with REDIS_URL environment variable fallback.',
        'affected_files': 'backend/config/settings.py, backend/requirements.txt',
        'verification_steps': '1. Start Redis on port 6379. 2. Run python manage.py check. 3. Test cache.set/get and WebSocket broadcast across two Daphne worker instances.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Unlocks horizontal scaling across multiple Daphne processes.'
    },
    {
        'id': 'FIX-03-OPS-03',
        'subsystem': 'Scheduled Jobs',
        'dossier_ref': '04-concurrency-and-async',
        'title': 'Automated Background Cron Daemon & Expiration Worker',
        'severity': 'High',
        'current_defect': 'expire_booking_windows() and send_reminders() depend on manual HTTP requests to /api/cron/reminders with no automatic background daemon.',
        'proposed_fix': 'Create a standalone worker container / systemd service executing manage.py send_reminders and expire_booking_windows every 5 minutes.',
        'affected_files': 'backend/core/management/commands/run_scheduler.py, docker-compose.yml',
        'verification_steps': '1. Run python manage.py run_scheduler --once. 2. Verify booking windows expired and halfway reminders written to notifications table.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Ensures vehicles and drivers are never trapped by absent approvers.'
    },
    {
        'id': 'FIX-03-OPS-04',
        'subsystem': 'Reverse Proxy',
        'dossier_ref': '07-infrastructure-docker-redis',
        'title': 'Nginx Reverse Proxy & WebSocket Upgrade Configuration',
        'severity': 'High',
        'current_defect': 'No Nginx configuration file exists for routing /api/ to Django, /ws/ with HTTP/1.1 Upgrade headers to Daphne, and static frontend assets.',
        'proposed_fix': 'Create nginx/nginx.conf and conf.d/synchoo.conf with gzip/brotli compression, security headers (CSP, HSTS, X-Frame-Options), and WebSocket proxying.',
        'affected_files': 'nginx/nginx.conf, nginx/conf.d/synchoo.conf',
        'verification_steps': '1. Test nginx configuration with nginx -t -c nginx/nginx.conf. 2. Verify proxy_pass correctly handles /api and /ws WebSocket upgrades.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Crucial for SSL termination and sub-millisecond static file serving.'
    },
    {
        'id': 'FIX-03-OPS-05',
        'subsystem': 'Environment & Secrets',
        'dossier_ref': '00-executive-summary, LEFTOVER_WORK.md',
        'title': 'Environment Templates & Secrets Isolation Blueprint',
        'severity': 'Medium',
        'current_defect': 'Root .env.example contains legacy Supabase references; production templates need clean isolation between backend and frontend secrets.',
        'proposed_fix': 'Create .env.production.example templates for root, backend, and frontend with Razorpay webhook secret, Google OAuth, and Redis connection strings.',
        'affected_files': '.env.production.example, backend/.env.production.example, frontend/.env.production.example',
        'verification_steps': '1. Verify no secret keys are committed. 2. Validate all mandatory settings in backend/config/settings.py have corresponding template variables.',
        'status': 'Pending',
        'actual_result': 'Awaiting plan approval & implementation',
        'notes': 'Remediates item 3 in local/LEFTOVER_WORK.md.'
    }
]

create_feedback_sheet(f'{base_dir}/part-3-devops-infra-production/FIX_FEEDBACK_PART_3.xlsx', 'Part 3: DevOps, Multi-Container Infra & Redis', 'PART-3', part3_items)
print('All workbooks created successfully.')
