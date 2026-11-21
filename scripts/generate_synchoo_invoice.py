"""
Generate Synchoo Corporate Commercial Invoice PDF & high-res PNG preview
using PyMuPDF, precisely matching the uploaded layout and Synchoo's brand identity.
Embeds Segoe UI TrueType fonts with full native Unicode Indian Rupee (₹) glyph support.
"""
import os
import pymupdf  # PyMuPDF

def build_synchoo_invoice(pdf_out_path, png_out_path):
    os.makedirs(os.path.dirname(pdf_out_path), exist_ok=True)
    os.makedirs(os.path.dirname(png_out_path), exist_ok=True)

    # A4 dimensions in points: 595.32 x 841.92
    W, H = 595.32, 841.92
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)

    # Register Segoe UI / Arial fonts for native Unicode ₹ glyph support
    segoe_reg = "C:/Windows/Fonts/segoeui.ttf" if os.path.exists("C:/Windows/Fonts/segoeui.ttf") else "C:/Windows/Fonts/arial.ttf"
    segoe_bold = "C:/Windows/Fonts/segoeuib.ttf" if os.path.exists("C:/Windows/Fonts/segoeuib.ttf") else "C:/Windows/Fonts/arialbd.ttf"
    page.insert_font(fontname="segoe", fontfile=segoe_reg)
    page.insert_font(fontname="segoeb", fontfile=segoe_bold)

    # Color Palette - Synchoo brand
    PRIMARY = (2/255, 132/255, 199/255)       # #0284c7 Sky/Cyan blue
    PRIMARY_DARK = (15/255, 23/255, 42/255)   # #0f172a Slate 900
    CYAN_ACCENT = (21/255, 206/255, 218/255)  # #15CEDA Cyan
    CYAN_LIGHT = (224/255, 242/255, 254/255)  # #e0f2fe Cyan light tint
    HEADER_BG = (240/255, 249/255, 255/255)   # #f0f9ff Soft ice cyan
    TEXT_MAIN = (15/255, 23/255, 42/255)      # #0f172a
    TEXT_MUTED = (100/255, 116/255, 139/255)  # #64748b
    LINE_COLOR = (203/255, 213/255, 225/255)  # #cbd5e1
    LINE_ACCENT = (2/255, 132/255, 199/255)   # #0284c7
    TABLE_HEAD_BG = (224/255, 242/255, 254/255) # Soft cyan/slate
    BG_CARD = (248/255, 250/255, 252/255)

    # 1. Background subtle graphic elements
    # Top-left rounded pill background
    shape = page.new_shape()
    shape.draw_rect(pymupdf.Rect(0, 0, 75, 120), radius=0.2)
    shape.finish(fill=HEADER_BG, color=None)
    shape.commit()

    # Top-right curved arcs (matching template's curved graphic arch, styled in Synchoo cyan/steel)
    shape = page.new_shape()
    # Outer arch
    shape.draw_bezier(pymupdf.Point(380, 0), pymupdf.Point(380, 110), pymupdf.Point(510, 145), pymupdf.Point(595.32, 115))
    shape.finish(color=PRIMARY, width=3.5)
    # Inner subtle arch
    shape.draw_bezier(pymupdf.Point(415, 0), pymupdf.Point(415, 95), pymupdf.Point(525, 128), pymupdf.Point(595.32, 102))
    shape.finish(color=CYAN_ACCENT, width=1.5)
    shape.commit()

    # Mid-left subtle curved accent (from template)
    shape = page.new_shape()
    shape.draw_bezier(pymupdf.Point(0, 430), pymupdf.Point(32, 455), pymupdf.Point(32, 495), pymupdf.Point(0, 520))
    shape.finish(color=PRIMARY, width=3.0)
    shape.commit()

    # Bottom-left decorative rectangle block
    shape = page.new_shape()
    shape.draw_rect(pymupdf.Rect(20, 795, 42, 817))
    shape.finish(fill=CYAN_LIGHT, color=PRIMARY, width=1)
    shape.commit()

    # Bottom-right circular seal accent
    shape = page.new_shape()
    shape.draw_circle(pymupdf.Point(505, 842), 65)
    shape.finish(fill=HEADER_BG, color=LINE_COLOR, width=1)
    shape.commit()

    # 2. Logo & Brand (Top Left)
    logo_path = "frontend/src/assets/synchoo-mark.png"
    if os.path.exists(logo_path):
        page.insert_image(pymupdf.Rect(35, 30, 85, 80), filename=logo_path, keep_proportion=True)

    # Company Name & Slogan
    page.insert_text(pymupdf.Point(92, 54), "SYNCHOO", fontname="segoeb", fontsize=22, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(93, 67), "ENTERPRISE MOBILITY SUITE", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(93, 77), "One Connected Operating System for Shared Mobility", fontname="segoe", fontsize=7.5, color=TEXT_MUTED)

    # Top Right Header
    page.insert_text(pymupdf.Point(460, 42), "COMMERCIAL", fontname="segoeb", fontsize=11, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(420, 68), "INVOICE", fontname="segoeb", fontsize=26, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(415, 82), "Enterprise Fleet & Mobility Operations", fontname="segoe", fontsize=7.5, color=PRIMARY)

    # 3. Metadata Grid (Forwarding Agent, Date, Invoice No, etc.)
    y_meta = 125
    # Row 1
    page.insert_text(pymupdf.Point(40, y_meta), "FORWARDING AGENT", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(40, y_meta + 12), "Synchoo Corporate Express", fontname="segoe", fontsize=8.5, color=PRIMARY_DARK)

    page.insert_text(pymupdf.Point(370, y_meta), "DATE", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(370, y_meta + 12), "21/11/2026", fontname="segoe", fontsize=8.5, color=PRIMARY_DARK)

    page.insert_text(pymupdf.Point(460, y_meta), "INVOICE NUMBER", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(460, y_meta + 12), "SYN-CORP-2026-0894", fontname="segoeb", fontsize=8.5, color=PRIMARY)

    # Row 2
    y_meta_2 = 155
    page.insert_text(pymupdf.Point(40, y_meta_2), "TRACKING / BOOKING REF", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(40, y_meta_2 + 12), "55888800000998700", fontname="segoe", fontsize=8.5, color=PRIMARY_DARK)

    page.insert_text(pymupdf.Point(235, y_meta_2), "BILLING CURRENCY", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(235, y_meta_2 + 12), "INR (₹) · Indian Rupee", fontname="segoeb", fontsize=8.5, color=PRIMARY)

    page.insert_text(pymupdf.Point(370, y_meta_2), "PAID BY", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(370, y_meta_2 + 12), "CREDIT CARD / NET 30", fontname="segoe", fontsize=8.5, color=PRIMARY_DARK)

    page.insert_text(pymupdf.Point(460, y_meta_2), "ORDER / ACCOUNT ID", fontname="segoeb", fontsize=7.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(460, y_meta_2 + 12), "X001525 · CORP-992", fontname="segoe", fontsize=8.5, color=PRIMARY_DARK)

    # Divider Line 1
    shape = page.new_shape()
    shape.draw_line(pymupdf.Point(40, 185), pymupdf.Point(555, 185))
    shape.finish(color=LINE_ACCENT, width=1.5)
    shape.commit()

    # 4. SOLD BY & BILL TO
    y_parties = 202
    page.insert_text(pymupdf.Point(40, y_parties), "SOLD BY", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(370, y_parties), "BILL TO", fontname="segoeb", fontsize=8, color=PRIMARY)

    # Sold by details
    page.insert_text(pymupdf.Point(40, y_parties + 15), "SYNCHOO TECHNOLOGIES PVT. LTD.", fontname="segoeb", fontsize=9, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(40, y_parties + 28), "100 Feet Road, Indiranagar", fontname="segoe", fontsize=8, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(40, y_parties + 39), "Bengaluru, Karnataka 560038, India", fontname="segoe", fontsize=8, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(40, y_parties + 50), "+91 (80) 4000 7800 · enterprise@synchoo.com", fontname="segoe", fontsize=8, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(40, y_parties + 61), "GSTIN: 29AAACS1234F1Z8 · SAC: 9966", fontname="segoeb", fontsize=8, color=PRIMARY_DARK)

    # Bill to details
    page.insert_text(pymupdf.Point(370, y_parties + 15), "ACORN ENTERPRISES INDIA PVT. LTD.", fontname="segoeb", fontsize=9, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(370, y_parties + 28), "100 Mighty Bay, Tech Corridor", fontname="segoe", fontsize=8, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(370, y_parties + 39), "Bengaluru, Karnataka 560045, India", fontname="segoe", fontsize=8, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(370, y_parties + 50), "+91 (80) 2555 6678 · billing@acorncorp.com", fontname="segoe", fontsize=8, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(370, y_parties + 61), "GSTIN: 29AABCS5432G1Z2 (ITC Eligible)", fontname="segoeb", fontsize=8, color=PRIMARY_DARK)

    # Divider Line 2
    shape = page.new_shape()
    shape.draw_line(pymupdf.Point(40, 275), pymupdf.Point(555, 275))
    shape.finish(color=LINE_COLOR, width=1.0)
    shape.commit()

    # 5. Table Header
    y_table = 290
    shape = page.new_shape()
    shape.draw_rect(pymupdf.Rect(40, y_table, 555, y_table + 24), radius=0.1)
    shape.finish(fill=TABLE_HEAD_BG, color=None)
    shape.commit()

    page.insert_text(pymupdf.Point(46, y_table + 16), "PRODUCT / SERVICE", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(235, y_table + 16), "HS / SAC CODE", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(325, y_table + 16), "UNITS", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(385, y_table + 16), "UNIT PRICE (₹)", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(485, y_table + 16), "TOTAL (₹)", fontname="segoeb", fontsize=8, color=PRIMARY)

    # Table Items (all denominations in INR ₹)
    items = [
        {
            "name": "Conveyor Fleet EV - Tata Nexon EV Max",
            "desc": "Country of origin: IN · Dedicated executive zero-emission fleet",
            "code": "88565.2252",
            "units": "2",
            "price": "₹ 20,000.00",
            "total": "₹ 40,000.00"
        },
        {
            "name": "Verified Dedicated Chauffeur Service (Full-Day)",
            "desc": "Country of origin: IN · Licence-verified commercial driver shift",
            "code": "88565.2545",
            "units": "1",
            "price": "₹ 8,500.00",
            "total": "₹ 8,500.00"
        },
        {
            "name": "Executive Chauffeur Service - Evening Airport Route",
            "desc": "Country of origin: IN · Priority terminal transfer & QR handover",
            "code": "88565.2545",
            "units": "1",
            "price": "₹ 8,500.00",
            "total": "₹ 8,500.00"
        },
        {
            "name": "Smart Corporate Carpooling Corridor Network",
            "desc": "Country of origin: IN · Electronic City to Indiranagar daily pool",
            "code": "88565.2545",
            "units": "1",
            "price": "₹ 8,500.00",
            "total": "₹ 8,500.00"
        },
        {
            "name": "Doorstep Fleet Eco-Care & Waterless Sanitization",
            "desc": "Country of origin: IN · Complete exterior wash & cabin sterilization",
            "code": "88565.2545",
            "units": "1",
            "price": "₹ 8,500.00",
            "total": "₹ 8,500.00"
        }
    ]

    curr_y = y_table + 40
    for idx, it in enumerate(items):
        # Row divider
        shape = page.new_shape()
        shape.draw_line(pymupdf.Point(40, curr_y - 12), pymupdf.Point(555, curr_y - 12))
        shape.finish(color=(241/255, 245/255, 249/255), width=0.8)
        shape.commit()

        page.insert_text(pymupdf.Point(46, curr_y), it["name"], fontname="segoeb", fontsize=8.5, color=TEXT_MAIN)
        page.insert_text(pymupdf.Point(46, curr_y + 11), it["desc"], fontname="segoe", fontsize=7, color=TEXT_MUTED)

        page.insert_text(pymupdf.Point(235, curr_y + 5), it["code"], fontname="segoe", fontsize=8, color=TEXT_MUTED)
        page.insert_text(pymupdf.Point(335, curr_y + 5), it["units"], fontname="segoe", fontsize=8.5, color=TEXT_MAIN)
        page.insert_text(pymupdf.Point(390, curr_y + 5), it["price"], fontname="segoe", fontsize=8.5, color=TEXT_MAIN)
        page.insert_text(pymupdf.Point(485, curr_y + 5), it["total"], fontname="segoeb", fontsize=8.5, color=PRIMARY_DARK)

        curr_y += 34

    # Bottom Table Border
    shape = page.new_shape()
    shape.draw_line(pymupdf.Point(40, curr_y), pymupdf.Point(555, curr_y))
    shape.finish(color=LINE_COLOR, width=1.0)
    shape.commit()

    # 6. Bottom Columns: Terms & Details (Left) vs Totals (Right)
    y_bottom = curr_y + 22

    # Left: Terms & Service Details
    page.insert_text(pymupdf.Point(46, y_bottom), "Insurance: COMPREHENSIVE COVER INCLUDED", fontname="segoeb", fontsize=8, color=PRIMARY_DARK)
    page.insert_text(pymupdf.Point(46, y_bottom + 18), "Reason for export: CORPORATE MOBILITY OPERATIONS", fontname="segoe", fontsize=8, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(46, y_bottom + 36), "Incoterms / Terms: DAP · NET 30 DAYS", fontname="segoe", fontsize=8, color=TEXT_MAIN)

    page.insert_text(pymupdf.Point(46, y_bottom + 58), "Description of the services & consignment (INR · ₹):", fontname="segoeb", fontsize=8, color=PRIMARY)
    page.insert_text(pymupdf.Point(46, y_bottom + 71), "• Dedicated EV Fleet Units with Active Telematics (2 units)", fontname="segoe", fontsize=7.5, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(46, y_bottom + 83), "• Verified Chauffeur Operations & Digital QR Handover (2 shifts)", fontname="segoe", fontsize=7.5, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(46, y_bottom + 95), "• Employee Carpooling Subsidy & Automated Route Settlement", fontname="segoe", fontsize=7.5, color=TEXT_MUTED)

    # Right: Totals Box (INR Denominated)
    x_total_label = 335
    x_total_val = 490

    page.insert_text(pymupdf.Point(x_total_label, y_bottom), "Sub Total (INR)", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(x_total_val, y_bottom), "₹ 48,500.00", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)

    page.insert_text(pymupdf.Point(x_total_label, y_bottom + 18), "Shipping / Dispatch Charges", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(x_total_val, y_bottom + 18), "₹ 10,000.00", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)

    page.insert_text(pymupdf.Point(x_total_label, y_bottom + 36), "Insurance & Telematics", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(x_total_val, y_bottom + 36), "₹ 0.00", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)

    page.insert_text(pymupdf.Point(x_total_label, y_bottom + 54), "Sales Tax (GST 18% CGST/SGST)", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)
    page.insert_text(pymupdf.Point(x_total_val, y_bottom + 54), "₹ 11,700.00", fontname="segoe", fontsize=8.5, color=TEXT_MAIN)

    # Total divider
    shape = page.new_shape()
    shape.draw_line(pymupdf.Point(x_total_label - 5, y_bottom + 65), pymupdf.Point(555, y_bottom + 65))
    shape.finish(color=LINE_COLOR, width=1.0)
    shape.commit()

    page.insert_text(pymupdf.Point(x_total_label, y_bottom + 82), "Total Amount Due (INR)", fontname="segoeb", fontsize=10.5, color=PRIMARY_DARK)
    page.insert_text(pymupdf.Point(x_total_val, y_bottom + 82), "₹ 70,200.00", fontname="segoeb", fontsize=12, color=PRIMARY)

    # 7. Bottom Footer / Compliance
    shape = page.new_shape()
    shape.draw_line(pymupdf.Point(40, 770), pymupdf.Point(555, 770))
    shape.finish(color=(226/255, 232/255, 240/255), width=0.8)
    shape.commit()

    page.insert_text(pymupdf.Point(46, 783), "Digitally generated B2B corporate tax invoice under CGST Rule 46. Full Input Tax Credit (ITC) eligible.", fontname="segoe", fontsize=7, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(46, 793), "Corporate Billing: enterprise@synchoo.com · Support: 1800-SYNCHOO · synchoo.com/corporate", fontname="segoe", fontsize=7, color=TEXT_MUTED)
    page.insert_text(pymupdf.Point(500, 793), "© Synchoo Inc.", fontname="segoe", fontsize=7, color=TEXT_MUTED)

    # Save PDF with full font embedding
    doc.save(pdf_out_path)
    doc.close()
    print(f"PDF successfully created at: {pdf_out_path}")

    # Generate high-res image preview (300 DPI)
    doc_render = pymupdf.open(pdf_out_path)
    p0 = doc_render[0]
    pix = p0.get_pixmap(dpi=200)
    pix.save(png_out_path)
    doc_render.close()
    print(f"PNG preview successfully rendered at: {png_out_path}")

if __name__ == "__main__":
    import sys
    pdf_dest = sys.argv[1] if len(sys.argv) > 1 else "frontend/public/downloads/synchoo-corporate-invoice.pdf"
    png_dest = sys.argv[2] if len(sys.argv) > 2 else "frontend/public/downloads/synchoo-corporate-invoice-preview.png"
    build_synchoo_invoice(pdf_dest, png_dest)
