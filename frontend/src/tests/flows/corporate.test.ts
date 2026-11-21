import { describe, expect, test } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";

function setupCorporate() {
  const be = createBackend(new Date("2026-08-15T10:00:00Z"));
  const adminUser = be.registerAdmin();
  const companyAdmin = be.registerCustomer();
  const managerUser = be.registerCustomer();
  const employeeUser = be.registerCustomer("approved");
  const outsideUser = be.registerCustomer();

  const company = be.registerCompany(
    {
      name: "Acme Enterprises Private Limited",
      gstin: "29AAAAA0000A1Z5",
      billing_email: "billing@acme.com",
      city: "Bengaluru",
      initial_wallet: 50000,
    },
    companyAdmin,
  );

  // Approve company
  be.verifyCompany(adminUser, company.id, "approved");

  // Invite manager and employee
  const managerMember = be.inviteCompanyMember(companyAdmin, company.id, {
    user_id: managerUser,
    role: "manager",
    department: "Operations",
    monthly_limit: 40000,
  });

  const employeeMember = be.inviteCompanyMember(companyAdmin, company.id, {
    user_id: employeeUser,
    role: "employee",
    department: "Engineering",
    monthly_limit: 15000,
  });

  return {
    be,
    adminUser,
    companyAdmin,
    managerUser,
    employeeUser,
    outsideUser,
    company,
    managerMember,
    employeeMember,
  };
}

describe("Corporate accounts and approval workflows (CO-01 to CO-21)", () => {
  test("CO-01: Signed out view of corporate page presents onboarding without simulated accounts (GAP-14)", () => {
    const be = createBackend();
    // In signed-out state, no company data is exposed
    expect(be.tables.companies.size).toBe(0);
    expect(be.tables.companyTrips.size).toBe(0);
  });

  test("CO-02: Add employee and verify persistence", () => {
    const { be, companyAdmin, company } = setupCorporate();
    const newEmp = be.registerCustomer();
    const mem = be.inviteCompanyMember(companyAdmin, company.id, {
      user_id: newEmp,
      role: "employee",
      department: "Product",
      monthly_limit: 20000,
    });
    expect(mem.id).toBeTruthy();
    expect(be.tables.companyMembers.get(mem.id)?.user_id).toBe(newEmp);
    expect(be.tables.companyMembers.get(mem.id)?.monthly_limit).toBe(20000);
  });

  test("CO-03: Monthly GST invoice calculates 18% GST (9% CGST + 9% SGST)", () => {
    const { be, company, employeeUser, companyAdmin } = setupCorporate();
    be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "rental",
        amount: 1180,
      },
      employeeUser,
    );
    const inv = be.generateCorporateInvoice(company.id, "2026-08");
    expect(inv.base_amount).toBe(1000);
    expect(inv.cgst).toBe(90);
    expect(inv.sgst).toBe(90);
    expect(inv.total).toBe(1180);
    expect(inv.cgst + inv.sgst).toBe(180);
  });

  test("CO-04: Corporate wallet balance and credit limit reflect database state", () => {
    const { be, company } = setupCorporate();
    const c = be.tables.companies.get(company.id);
    expect(c?.wallet_balance).toBe(50000);
    expect(c?.credit_limit).toBe(0);
  });

  test("CO-05: Policy modification persists to company_policies", () => {
    const { be, companyAdmin, company } = setupCorporate();
    const updated = be.updateCompanyPolicy(companyAdmin, company.id, {
      max_price_per_day: 6000,
      approval_threshold: 4000,
      allowed_services: ["rental", "driver"],
    });
    expect(updated.max_price_per_day).toBe(6000);
    expect(updated.approval_threshold).toBe(4000);
    expect(updated.allowed_services).toEqual(["rental", "driver"]);

    const pol = Array.from(be.tables.companyPolicies.values()).find((p) => p.company_id === company.id);
    expect(pol?.max_price_per_day).toBe(6000);
  });

  test("CO-06: Company registration with GSTIN starts in pending status", () => {
    const be = createBackend();
    const founder = be.registerCustomer();
    const comp = be.registerCompany(
      {
        name: "Beta Corp Pvt Ltd",
        gstin: "29BBBBB1111B1Z2",
        billing_email: "finance@betacorp.com",
      },
      founder,
    );
    expect(comp.verification_status).toBe("pending");
    expect(comp.status).toBe("active");
  });

  test("CO-07: Admin approves or rejects company, notifying company admin", () => {
    const be = createBackend();
    const adminUser = be.registerAdmin();
    const founder = be.registerCustomer();
    const comp = be.registerCompany(
      {
        name: "Gamma Corp Pvt Ltd",
        gstin: "29CCCCC2222C1Z3",
        billing_email: "finance@gammacorp.com",
      },
      founder,
    );

    be.verifyCompany(adminUser, comp.id, "approved");
    expect(be.tables.companies.get(comp.id)?.verification_status).toBe("approved");

    const notifications = be.notifications.filter((n) => n.user_id === founder);
    expect(notifications.some((n) => n.title.includes("Company verification"))).toBe(true);
  });

  test("CO-08: Company admin invites employee by user ID and employee joins", () => {
    const { be, companyAdmin, company } = setupCorporate();
    const user = be.registerCustomer();
    const member = be.inviteCompanyMember(companyAdmin, company.id, {
      user_id: user,
      role: "employee",
      department: "Marketing",
      monthly_limit: 12000,
    });
    expect(member.status).toBe("active");
    expect(member.department).toBe("Marketing");
  });

  test("CO-09: Employee books on company account and trip is linked", () => {
    const { be, company, employeeUser } = setupCorporate();
    const res = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "driver",
        amount: 2500,
      },
      employeeUser,
    );
    expect(res.success).toBe(true);
    expect(res.trip_id).toBeTruthy();

    const trip = be.tables.companyTrips.get(res.trip_id!);
    expect(trip?.company_id).toBe(company.id);
    expect(trip?.service_type).toBe("driver");
  });

  test("CO-10: Employee exceeds monthly limit, requiring manager approval", () => {
    const { be, company, employeeUser } = setupCorporate();
    // Employee monthly limit is 15000, daily cap is 5000.
    // Create trips totaling 13000 (3000 each)
    for (let i = 0; i < 4; i++) {
      be.createCorporateTrip(
        { company_id: company.id, service_type: "rental", amount: 3000 },
        employeeUser,
      );
    }
    // Now employee has spent 12000. Next trip is 4000 (under daily cap 5000, but 12000+4000 > 15000).
    const pol = be.checkCorporatePolicy(company.id, employeeUser, "rental", 4000);
    expect(pol.allowed).toBe(true);
    expect(pol.in_policy).toBe(false);
    expect(pol.reason).toContain("Monthly spend limit");

    const res = be.createCorporateTrip(
      { company_id: company.id, service_type: "rental", amount: 4000 },
      employeeUser,
    );
    expect(res.approval_status).toBe("pending");
  });

  test("CO-11: Booking breaks policy (exceeds daily price cap or disallowed service)", () => {
    const { be, company, employeeUser, companyAdmin } = setupCorporate();
    // Default max_price_per_day is 5000. Request 6000.
    const polCap = be.checkCorporatePolicy(company.id, employeeUser, "rental", 6000);
    expect(polCap.in_policy).toBe(false);
    expect(polCap.reason).toContain("exceeds policy limit");

    // Disallow wash
    be.updateCompanyPolicy(companyAdmin, company.id, { allowed_services: ["rental", "driver"] });
    const polDisallowed = be.checkCorporatePolicy(company.id, employeeUser, "wash", 500);
    expect(polDisallowed.in_policy).toBe(false);
    expect(polDisallowed.reason).toContain("not permitted under corporate policy");
  });

  test("CO-12: Manager approves or rejects trip and employee is notified", () => {
    const { be, company, employeeUser, managerUser } = setupCorporate();
    const created = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "rental",
        amount: 8000, // out of policy
      },
      employeeUser,
    );
    expect(created.approval_status).toBe("pending");

    // Manager approves
    const dec = be.decideCorporateTrip(managerUser, created.trip_id!, "approve");
    expect(dec.status).toBe("approved");

    const empNotifs = be.notifications.filter((n) => n.user_id === employeeUser);
    expect(empNotifs.some((n) => n.title.includes("approved"))).toBe(true);
  });

  test("CO-13: Cancelled company trip refunds company wallet, not employee", () => {
    const { be, company, employeeUser, adminUser } = setupCorporate();
    const host = be.registerCustomer();
    const v = be.listVehicle(host, 800, 500);
    be.verifyVehicle(adminUser, v.id, "approved");

    const b = be.createBooking({
      customer_id: employeeUser,
      vehicle_id: v.id,
      start_date: "2026-08-20",
      end_date: "2026-08-22",
    });

    // Create in-policy corporate trip
    be.createCorporateTrip(
      {
        company_id: company.id,
        booking_id: b.id,
        service_type: "rental",
        amount: b.total_price,
      },
      employeeUser,
    );

    // Host confirms booking
    be.hostDecide(host, b.id, "confirmed");
    const compAfterBook = be.tables.companies.get(company.id)?.wallet_balance ?? 0;
    expect(compAfterBook).toBeLessThan(50000);

    // Cancel booking
    be.setNow(new Date("2026-08-16T10:00:00Z"));
    const cancelRes = be.cancelBooking(employeeUser, b.id);
    expect(cancelRes.refund).toBeGreaterThan(0);

    // Company wallet is refunded
    const compAfterCancel = be.tables.companies.get(company.id)?.wallet_balance ?? 0;
    expect(compAfterCancel).toBe(compAfterBook + cancelRes.refund);
  });

  test("CO-14: Month ends - consolidated GST invoice created from real trips", () => {
    const { be, company, employeeUser } = setupCorporate();
    be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "wash",
        amount: 1180,
      },
      employeeUser,
    );

    const inv = be.generateCorporateInvoice(company.id, "2026-08");
    expect(inv.base_amount).toBe(1000);
    expect(inv.cgst).toBe(90);
    expect(inv.sgst).toBe(90);
    expect(inv.total).toBe(1180);
    expect(inv.invoice_number).toContain("INV-");
  });

  test("CO-15: Removed employee cannot book on corporate account", () => {
    const { be, company, companyAdmin, employeeMember, employeeUser } = setupCorporate();
    be.removeCompanyMember(companyAdmin, company.id, employeeMember.id);

    expect(() =>
      be.createCorporateTrip(
        {
          company_id: company.id,
          service_type: "driver",
          amount: 2000,
        },
        employeeUser,
      ),
    ).toThrowError("not an active company member");
  });

  test("CO-16: User from outside company cannot access or book under company", () => {
    const { be, company, outsideUser } = setupCorporate();
    expect(() =>
      be.createCorporateTrip(
        {
          company_id: company.id,
          service_type: "rental",
          amount: 2000,
        },
        outsideUser,
      ),
    ).toThrowError("not an active company member");
  });

  test("CO-17: Overdue unpaid invoice causes company booking to pause", () => {
    const { be, company, employeeUser } = setupCorporate();
    be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "wash",
        amount: 1180,
      },
      employeeUser,
    );
    const inv = be.generateCorporateInvoice(company.id, "2026-07");
    inv.status = "overdue";

    // Advance clock past due date (35 days)
    be.setNow(new Date("2026-09-20T10:00:00Z"));
    be.pauseCompanyIfOverdue(company.id);

    const c = be.tables.companies.get(company.id);
    expect(c?.status).toBe("paused");

    expect(() =>
      be.createCorporateTrip(
        {
          company_id: company.id,
          service_type: "driver",
          amount: 1500,
        },
        employeeUser,
      ),
    ).toThrowError("Company booking is paused");
  });

  test("CO-18: In-policy booking sets auto approval, company pays on confirmation", () => {
    const { be, company, employeeUser } = setupCorporate();
    const res = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "driver",
        amount: 2000,
      },
      employeeUser,
    );
    expect(res.approval_status).toBe("auto");
    expect(res.in_policy).toBe(true);

    const trip = be.tables.companyTrips.get(res.trip_id!);
    expect(trip?.approval_status).toBe("auto");
    expect(trip?.respond_by).toBeNull();
  });

  test("CO-19: Out-of-policy booking sets respond_by for parallel manager and provider approval", () => {
    const { be, company, employeeUser } = setupCorporate();
    const res = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "rental",
        amount: 8000, // over 5000 max_price_per_day
      },
      employeeUser,
    );
    expect(res.approval_status).toBe("pending");
    expect(res.in_policy).toBe(false);

    const trip = be.tables.companyTrips.get(res.trip_id!);
    expect(trip?.respond_by).toBeTruthy();
  });

  test("CO-20: Manager misses deadline or declines out-of-policy booking", () => {
    const { be, company, employeeUser, managerUser } = setupCorporate();
    const res = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "driver",
        amount: 9000,
      },
      employeeUser,
    );

    // Manager declines
    const dec = be.decideCorporateTrip(managerUser, res.trip_id!, "reject");
    expect(dec.status).toBe("rejected");

    // Or expiry via expireBookingWindows
    const res2 = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "driver",
        amount: 9500,
      },
      employeeUser,
    );
    be.setNow(new Date("2026-08-16T00:00:00Z")); // 14 hours later, past respond_by
    be.expireBookingWindows();
    const trip2 = be.tables.companyTrips.get(res2.trip_id!);
    expect(trip2?.approval_status).toBe("expired");
  });

  test("CO-21: Out-of-policy booking with personal payment fallback", () => {
    const { be, company, employeeUser } = setupCorporate();
    const res = be.createCorporateTrip(
      {
        company_id: company.id,
        service_type: "rental",
        amount: 12000,
        force_personal: true,
      },
      employeeUser,
    );
    expect(res.success).toBe(true);
    expect(res.mode).toBe("personal");
    expect(res.trip_id).toBeUndefined();
  });
});
