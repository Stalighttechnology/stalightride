import { toast } from "sonner";
import { currency } from "./format";

export interface InvoiceData {
  id: string;
  month: string;
  tripsCount: number;
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
  status: string;
}

export interface CompanyData {
  companyName: string;
  gstin: string;
  workEmail: string;
  city: string;
}

export interface TripData {
  id: string;
  employee: string;
  dept: string;
  type: string;
  vehicle: string;
  amount: number;
  date: string;
  route: string;
  status: string;
}

export function downloadMonthlyGstInvoice(
  company: CompanyData,
  invoice: InvoiceData,
  trips: TripData[] = [],
) {
  try {
    const cgst = Math.round(invoice.gstAmount / 2);
    const sgst = invoice.gstAmount - cgst;
    const issueDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const tripsHtml = trips
      .map(
        (t, idx) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${idx + 1}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <strong>${t.employee}</strong><br/>
          <span style="color: #64748b; font-size: 11px;">${t.dept} · ${t.type}</span>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${t.route}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">${t.vehicle}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">${t.date}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; font-weight: 600;">${currency(t.amount)}</td>
      </tr>
    `,
      )
      .join("");

    const invoiceHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GST Tax Invoice - ${invoice.id} - ${company.companyName}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      padding: 24px;
      background: #f8fafc;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 36px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      .no-print { display: none !important; }
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .brand-name {
      font-size: 28px;
      font-weight: 800;
      color: #0284c7;
      letter-spacing: -0.5px;
    }
    .invoice-title {
      font-size: 20px;
      font-weight: 700;
      text-transform: uppercase;
      color: #0f172a;
      text-align: right;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    .info-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      font-size: 13px;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      margin-bottom: 24px;
    }
    .table th {
      background: #f1f5f9;
      color: #475569;
      text-align: left;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 10px 12px;
      border-bottom: 2px solid #cbd5e1;
    }
    .total-box {
      margin-left: auto;
      width: 320px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      padding: 16px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 4px 0;
    }
    .grand-total {
      font-size: 16px;
      font-weight: 800;
      border-top: 2px solid #cbd5e1;
      padding-top: 8px;
      margin-top: 8px;
      color: #0284c7;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      text-align: center;
    }
    .btn-print {
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 10px 20px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 800px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center;">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <span style="font-size: 13px; color: #64748b;">Consolidated Monthly Tax Invoice</span>
  </div>

  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="brand-name">Synchoo</div>
        <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">
          Synchoo Technologies Private Limited<br/>
          CIN: U63030KA2025PTC189201<br/>
          GSTIN: 29AAACS1234F1Z8 · SAC Code: 9966 (Rent-a-Cab Mobility Services)<br/>
          Bengaluru, Karnataka, India - 560001
        </p>
      </div>
      <div>
        <div class="invoice-title">Tax Invoice</div>
        <p style="margin: 4px 0 0; font-size: 13px; text-align: right; color: #334155;">
          <strong>Invoice #:</strong> ${invoice.id}<br/>
          <strong>Billing Period:</strong> ${invoice.month}<br/>
          <strong>Date of Issue:</strong> ${issueDate}<br/>
          <strong>Status:</strong> <span style="color: #16a34a; font-weight: 700;">PAID (Net 30)</span>
        </p>
      </div>
    </div>

    <div class="grid-2">
      <div class="info-box">
        <h3 style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #475569;">Billed To (Client Entity):</h3>
        <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">${company.companyName}</p>
        <p style="margin: 4px 0 0; color: #475569;">
          <strong>GSTIN:</strong> ${company.gstin} (ITC Eligible)<br/>
          <strong>Place of Supply:</strong> ${company.city}, Karnataka (State Code: 29)<br/>
          <strong>Official Contact:</strong> ${company.workEmail}
        </p>
      </div>
      <div class="info-box">
        <h3 style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #475569;">Payment & Terms:</h3>
        <p style="margin: 0; color: #475569;">
          <strong>Credit Facility:</strong> Corporate Line Net 30 (Approved)<br/>
          <strong>Trips Included:</strong> ${invoice.tripsCount} corporate rides<br/>
          <strong>Reverse Charge:</strong> No (Direct B2B Tax Invoice)<br/>
          <strong>Category:</strong> Corporate Staff Mobility & Carpool Subsidy
        </p>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>Employee & Department</th>
          <th>Route</th>
          <th>Vehicle Category</th>
          <th>Trip Date</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${
          tripsHtml ||
          `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">1</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;"><strong>Consolidated Corporate Travel</strong><br/><span style="color: #64748b; font-size: 11px;">${invoice.tripsCount} Completed Employee Trips</span></td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">City & Airport Corporate Travel</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">EV, Sedan & Chauffeur</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${invoice.month}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${currency(invoice.baseAmount)}</td>
          </tr>
        `
        }
      </tbody>
    </table>

    <div class="total-box">
      <div class="total-row">
        <span>Taxable Base Value:</span>
        <span style="font-weight: 600;">${currency(invoice.baseAmount)}</span>
      </div>
      <div class="total-row">
        <span>CGST (9.0%):</span>
        <span>${currency(cgst)}</span>
      </div>
      <div class="total-row">
        <span>SGST (9.0%):</span>
        <span>${currency(sgst)}</span>
      </div>
      <div class="total-row" style="color: #16a34a; font-weight: 600;">
        <span>Input Tax Credit (ITC):</span>
        <span>${currency(invoice.gstAmount)}</span>
      </div>
      <div class="total-row grand-total">
        <span>Total Amount Due:</span>
        <span>${currency(invoice.totalAmount)}</span>
      </div>
    </div>

    <div class="footer">
      <p style="margin: 0;">
        This is a digitally generated tax invoice issued under Rule 46 of the CGST Rules, 2017.<br/>
        For billing questions or corporate support, contact <strong>enterprise@synchoo.com</strong> or call 1800-SYNCHOO.
      </p>
    </div>
  </div>
</body>
</html>`;

    // 1. Download file directly via Blob
    const blob = new Blob([invoiceHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `synchoo-gst-invoice-${invoice.id}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 2. Open print preview in popup for direct Save to PDF
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(invoiceHtml);
      printWindow.document.close();
    }

    toast.success(`GST Tax Invoice ${invoice.id} downloaded successfully!`);
  } catch (err) {
    toast.error("Failed to generate GST invoice. Please try again.");
  }
}

export function downloadTripReceipt(trip: TripData, company: CompanyData) {
  try {
    const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Synchoo Trip Receipt - ${trip.id}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      padding: 30px;
      margin: 0;
    }
    .card {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 32px;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand { font-size: 24px; font-weight: 800; color: #0284c7; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #ecfdf5;
      color: #047857;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .label { color: #64748b; }
    .value { font-weight: 600; color: #0f172a; }
    .total-box { margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <div class="brand">Synchoo</div>
        <p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Enterprise Mobility Receipt</p>
      </div>
      <span class="badge">Billed to ${company.companyName}</span>
    </div>

    <div class="row"><span class="label">Trip Reference ID:</span><span class="value">${trip.id}</span></div>
    <div class="row"><span class="label">Employee:</span><span class="value">${trip.employee} (${trip.dept})</span></div>
    <div class="row"><span class="label">Date:</span><span class="value">${trip.date}</span></div>
    <div class="row"><span class="label">Service Category:</span><span class="value">${trip.type}</span></div>
    <div class="row"><span class="label">Vehicle / Driver:</span><span class="value">${trip.vehicle}</span></div>
    <div class="row"><span class="label">Route:</span><span class="value">${trip.route}</span></div>
    <div class="row"><span class="label">Status:</span><span class="value" style="color: #16a34a;">${trip.status}</span></div>

    <div class="total-box">
      <div class="row" style="border: none;">
        <span class="label" style="font-size: 15px; font-weight: 700; color: #0f172a;">Total Charged to Account:</span>
        <span class="value" style="font-size: 18px; color: #0284c7;">${currency(trip.amount)}</span>
      </div>
      <p style="margin: 6px 0 0; font-size: 11px; color: #64748b;">GST included under company SAC 9966 line. ITC eligible for ${company.gstin}.</p>
    </div>

    <p style="margin-top: 24px; text-align: center; font-size: 11px; color: #94a3b8;">
      Synchoo Technologies Private Limited · Bengaluru, Karnataka · support@synchoo.com
    </p>
  </div>
</body>
</html>`;

    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `synchoo-receipt-${trip.id}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Trip receipt ${trip.id} downloaded!`);
  } catch {
    toast.error("Failed to download trip receipt.");
  }
}
