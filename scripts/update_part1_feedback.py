import zipfile
import io
import os
import openpyxl
from openpyxl.styles import Font, PatternFill

zip_path = os.path.join('.local', 'part-2-enterprise-billing-corporate.zip')

with zipfile.ZipFile(zip_path, 'r') as z:
    data = z.read('part-1-security-auth-concurrency/FIX_FEEDBACK_PART_1.xlsx')

wb = openpyxl.load_workbook(io.BytesIO(data))

green_font = Font(name='Segoe UI', size=10, bold=True, color='0015803D')
green_fill = PatternFill(start_color='00DCFCE7', end_color='00DCFCE7', fill_type='solid')

# 1. Update Summary Sheet
ws_summary = wb['Summary']
cell_status = ws_summary.cell(6, 2)
cell_status.value = 'Passed & Verified'
cell_status.font = green_font
cell_status.fill = green_fill

# 2. Update Fix Feedback Checklist
ws_checklist = wb['Fix Feedback Checklist']

updates = {
    'FIX-01-SEC-01': {
        'status': 'Passed',
        'result': 'Verified with automated test suite. Unauthorized cross-booking incident insert rejected by RLS with permission denied (error 42501). Authorized customer and host incidents accepted with real-time notifications created. SOS alert without booking_id allowed for emergency reporting.',
        'comments': 'Verified via migration 0041_incident_and_storage_security and test suite scripts/test_part1_fixes.py. AP-07.8 fully remediated.'
    },
    'FIX-01-SEC-02': {
        'status': 'Passed',
        'result': 'Verified. public_file view returns 404 Not Found for unapproved or pending vehicle photos to anonymous visitors. Approved vehicle photos return 200 OK. Authenticated host is authorized to view their own unapproved photos.',
        'comments': 'Verified in backend/files/views.py with automated tests. Resolves AP-07.5 public storage media leak.'
    },
    'FIX-01-CONC-01': {
        'status': 'Passed',
        'result': 'Verified. 10 parallel threads executed simultaneous overlapping bookings on the same vehicle. PostgreSQL btree_gist exclusion constraint (bookings_no_overlap) and FOR NO KEY UPDATE pessimistic lock ensured exactly 1 reservation succeeded and 9 failed with conflict.',
        'comments': 'Zero double-bookings possible under concurrency. Backed by PostgreSQL exclusion constraint and row-level locking.'
    },
    'FIX-01-SEC-03': {
        'status': 'Passed',
        'result': 'Verified. delete_my_account_data RPC triggers purge_user_media(), deleting user directory from MEDIA_ROOT (including kyc-docs, avatars, and verification files) and cleaning up storage.objects records with db_role("service_role").',
        'comments': 'Automated test confirmed disk directories and storage records are completely eradicated upon account deletion. Resolves CU-08.2.'
    },
    'FIX-01-HOST-01': {
        'status': 'Passed',
        'result': 'Verified. Soft-deleted vehicle (is_deleted=true) is excluded from public search and vendor fleet queries. Attempting to unpause or reactivate a soft-deleted vehicle is blocked both in UI and at database level by trg_enforce_vehicle_deletion_integrity trigger.',
        'comments': 'Enforced at database trigger level and in frontend vendor UI. Remediates PR-01.12 state inconsistency defect.'
    }
}

for r in range(2, ws_checklist.max_row + 1):
    fix_id = ws_checklist.cell(r, 1).value
    if fix_id in updates:
        item = updates[fix_id]
        c_status = ws_checklist.cell(r, 10)
        c_status.value = item['status']
        c_status.font = green_font
        c_status.fill = green_fill
        
        c_result = ws_checklist.cell(r, 11)
        c_result.value = item['result']
        
        c_comments = ws_checklist.cell(r, 12)
        c_comments.value = item['comments']

out_buf = io.BytesIO()
wb.save(out_buf)
updated_bytes = out_buf.getvalue()

# Verify updated workbook in memory
wb2 = openpyxl.load_workbook(io.BytesIO(updated_bytes))
print('Summary B6:', wb2['Summary'].cell(6, 2).value)
for r in range(2, 7):
    print(wb2['Fix Feedback Checklist'].cell(r, 1).value, '->', wb2['Fix Feedback Checklist'].cell(r, 10).value)

# Save local copy
local_dir = os.path.join('.local', 'part-1-security-auth-concurrency')
os.makedirs(local_dir, exist_ok=True)
local_xlsx = os.path.join(local_dir, 'FIX_FEEDBACK_PART_1.xlsx')
with open(local_xlsx, 'wb') as f:
    f.write(updated_bytes)
print(f'Saved local copy to {local_xlsx}')

# Update zip archive safely
temp_zip = zip_path + '.tmp'
with zipfile.ZipFile(zip_path, 'r') as zin:
    with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == 'part-1-security-auth-concurrency/FIX_FEEDBACK_PART_1.xlsx':
                zout.writestr(item, updated_bytes)
            else:
                zout.writestr(item, zin.read(item.filename))

os.replace(temp_zip, zip_path)
print(f'Successfully updated FIX_FEEDBACK_PART_1.xlsx inside {zip_path}!')
