import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Briefcase,
  Building,
  Users,
  CheckCircle2,
  Receipt,
  Car,
  ShieldCheck,
  Send,
  Sliders,
  CreditCard,
  Clock,
  Sparkles,
  AlertTriangle,
  Flag,
  UserPlus,
  Trash2,
  FileText,
} from "lucide-react";

export const Route = createFileRoute("/corporate")({
  component: CorporatePage,
  head: () => ({
    meta: [
      { title: "Synchoo Corporate — Enterprise Mobility Suite" },
      {
        name: "description",
        content:
          "Centralized corporate mobility, business GST invoicing, monthly travel budgets, and ride monitoring for enterprises.",
      },
    ],
  }),
});

interface Company {
  id: string;
  name: string;
  gstin: string;
  billing_email: string;
  city: string;
  verification_status: "pending" | "approved" | "rejected";
  credit_limit: number;
  wallet_balance: number;
  status: "active" | "paused";
}

interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: "admin" | "manager" | "employee";
  department: string | null;
  monthly_limit: number;
  status: "active" | "removed";
}

interface CompanyPolicy {
  id: string;
  company_id: string;
  allowed_services: string[];
  max_price_per_day: number;
  approval_threshold: number;
  require_manager_approval: boolean;
}

interface CompanyTrip {
  id: string;
  company_id: string;
  member_id: string;
  booking_id: string | null;
  driver_booking_id: string | null;
  wash_booking_id: string | null;
  service_type: string;
  amount: number;
  approval_status: "auto" | "pending" | "approved" | "rejected" | "expired";
  manager_id: string | null;
  respond_by: string | null;
  is_flagged: boolean;
  flagged_reason: string | null;
  created_at: string;
}

interface CompanyInvoice {
  id: string;
  company_id: string;
  invoice_number: string;
  month: string;
  base_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  status: "draft" | "issued" | "paid" | "overdue" | "cancelled";
  due_date: string;
  created_at: string;
}

export function CorporatePage() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [myMembership, setMyMembership] = useState<CompanyMember | null>(null);
  const [policy, setPolicy] = useState<CompanyPolicy | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [trips, setTrips] = useState<CompanyTrip[]>([]);
  const [invoices, setInvoices] = useState<CompanyInvoice[]>([]);

  // Registration Form
  const [regName, setRegName] = useState("");
  const [regGstin, setRegGstin] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regCity, setRegCity] = useState("Bengaluru");
  const [submittingReg, setSubmittingReg] = useState(false);

  // Invite Member Form
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "employee">("employee");
  const [inviteDept, setInviteDept] = useState("Engineering");
  const [inviteLimit, setInviteLimit] = useState("15000");
  const [inviting, setInviting] = useState(false);

  // Policy Form State
  const [editMaxPrice, setEditMaxPrice] = useState("5000");
  const [editThreshold, setEditThreshold] = useState("3000");
  const [editAllowedServices, setEditAllowedServices] = useState<string[]>(["rental", "driver", "wash"]);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Flag Trip Dialog State
  const [flaggingTripId, setFlaggingTripId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: authData } = await api.auth.getUser();
      const user = authData?.user;
      setCurrentUser(user);

      if (!user) {
        setCompany(null);
        setLoading(false);
        return;
      }

      // Check if user is a member of any active company
      const { data: memberRows, error: memErr } = await api
        .from("company_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);

      if (memErr || !memberRows || memberRows.length === 0) {
        setCompany(null);
        setLoading(false);
        return;
      }

      const member = memberRows[0] as CompanyMember;
      setMyMembership(member);

      // Fetch company details
      const { data: compRows } = await api
        .from("companies")
        .select("*")
        .eq("id", member.company_id)
        .limit(1);

      if (compRows && compRows.length > 0) {
        const c = compRows[0] as Company;
        setCompany(c);

        // Fetch policies, members, trips, invoices in parallel
        const [polRes, memsRes, tripsRes, invsRes] = await Promise.all([
          api.from("company_policies").select("*").eq("company_id", c.id).limit(1),
          api.from("company_members").select("*").eq("company_id", c.id),
          api.from("company_trips").select("*").eq("company_id", c.id).order("created_at", { ascending: false }),
          api.from("company_invoices").select("*").eq("company_id", c.id).order("created_at", { ascending: false }),
        ]);

        if (polRes.data && polRes.data.length > 0) {
          const p = polRes.data[0] as CompanyPolicy;
          setPolicy(p);
          setEditMaxPrice(String(p.max_price_per_day));
          setEditThreshold(String(p.approval_threshold));
          setEditAllowedServices(p.allowed_services);
        }

        if (memsRes.data) setMembers(memsRes.data as CompanyMember[]);
        if (tripsRes.data) setTrips(tripsRes.data as CompanyTrip[]);
        if (invsRes.data) setInvoices(invsRes.data as CompanyInvoice[]);
      }
    } catch (err: any) {
      console.error("Error loading corporate data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Company Registration
  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      return toast.error("Please sign in before registering a corporate account.");
    }
    if (!regName.trim() || !regGstin.trim() || !regEmail.trim()) {
      return toast.error("Company name, GSTIN, and billing email are required.");
    }

    try {
      setSubmittingReg(true);
      const { data: newComp, error: compErr } = await api
        .from("companies")
        .insert({
          name: regName.trim(),
          gstin: regGstin.trim().toUpperCase(),
          billing_email: regEmail.trim(),
          city: regCity.trim() || "Bengaluru",
          verification_status: "pending",
          wallet_balance: 50000,
          credit_limit: 0,
          status: "active",
        })
        .select()
        .single();

      if (compErr) {
        return toast.error(compErr.message || "Failed to register corporate account.");
      }

      // Add user as company admin
      await api.from("company_members").insert({
        company_id: newComp.id,
        user_id: currentUser.id,
        role: "admin",
        department: "Executive",
        monthly_limit: 50000,
        status: "active",
      });

      // Initialize default policy
      await api.from("company_policies").insert({
        company_id: newComp.id,
        allowed_services: ["rental", "driver", "wash"],
        max_price_per_day: 5000,
        approval_threshold: 3000,
        require_manager_approval: true,
      });

      toast.success("Corporate account created! Pending administrative verification.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setSubmittingReg(false);
    }
  };

  // Handle Trip Approval / Rejection
  const handleDecideTrip = async (tripId: string, decision: "approve" | "reject") => {
    try {
      const { error } = await api.rpc("corporate_decide_trip", {
        _trip_id: tripId,
        _decision: decision,
      });
      if (error) throw error;
      toast.success(`Trip request ${decision}d successfully.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update trip decision.");
    }
  };

  // Handle Flagging a Trip
  const handleFlagTrip = async () => {
    if (!flaggingTripId) return;
    try {
      const { error } = await api.rpc("flag_corporate_trip", {
        _trip_id: flaggingTripId,
        _reason: flagReason || "Manager audit review",
      });
      if (error) throw error;
      toast.success("Trip flagged for audit review.");
      setFlaggingTripId(null);
      setFlagReason("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to flag trip.");
    }
  };

  // Handle Policy Update
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !policy) return;
    try {
      setSavingPolicy(true);
      const { error } = await api
        .from("company_policies")
        .update({
          max_price_per_day: Number(editMaxPrice),
          approval_threshold: Number(editThreshold),
          allowed_services: editAllowedServices,
        })
        .eq("company_id", company.id);

      if (error) throw error;
      toast.success("Corporate travel policies updated successfully.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update corporate policy.");
    } finally {
      setSavingPolicy(false);
    }
  };

  // Handle Invite Member
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    if (!inviteUserId.trim()) return toast.error("Please enter a User ID or email.");

    try {
      setInviting(true);
      const { error } = await api.from("company_members").insert({
        company_id: company.id,
        user_id: inviteUserId.trim(),
        role: inviteRole,
        department: inviteDept.trim() || null,
        monthly_limit: Number(inviteLimit) || 10000,
        status: "active",
      });

      if (error) throw error;
      toast.success("Team member added successfully.");
      setInviteUserId("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add member.");
    } finally {
      setInviting(false);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await api
        .from("company_members")
        .update({ status: "removed" })
        .eq("id", memberId);

      if (error) throw error;
      toast.success("Member removed from company account.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member.");
    }
  };

  // Handle Generate Invoice
  const handleGenerateInvoice = async () => {
    if (!company) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    try {
      const { error } = await api.rpc("generate_corporate_invoice", {
        _company_id: company.id,
        _month: currentMonth,
      });
      if (error) throw error;
      toast.success(`Tax invoice for ${currentMonth} generated.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invoice.");
    }
  };

  const isAdmin = myMembership?.role === "admin";
  const isManager = myMembership?.role === "manager" || isAdmin;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <Clock className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Loading corporate suite...</p>
          </div>
        </main>
      </div>
    );
  }

  // View when user is not part of an existing company
  if (!company) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />

        <main className="flex-1 py-10 px-4 sm:px-6 max-w-6xl mx-auto w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/40"
                >
                  <Briefcase className="mr-1 h-3.5 w-3.5" /> Synchoo For Business
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Enterprise Mobility Suite
                </Badge>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
                Enterprise Mobility & Corporate Travel
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Centralized fleet booking, GST Input Tax Credit (ITC) invoicing, employee travel policies, and corporate billing.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Building className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                Corporate Underwriting & Compliance (GAP-14 Compliant)
              </p>
              <p>
                Corporate billing accounts and consolidated monthly GST invoices require business registration. Register your enterprise below to get immediate access to corporate booking windows, automated employee policy checks, and centralized prepaid billing.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7">
              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building className="h-4 w-4 text-brand" /> Register Enterprise Corporate Account
                  </CardTitle>
                  <CardDescription>
                    Set up your organization for central corporate wallet billing, manager approvals, and GST invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegisterCompany} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Company / Legal Entity Name *</Label>
                      <Input
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="e.g. Acme Technologies Private Limited"
                        required
                        className="text-xs"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Business GSTIN (for 18% ITC) *</Label>
                        <Input
                          value={regGstin}
                          onChange={(e) => setRegGstin(e.target.value)}
                          placeholder="e.g. 29AAAAA0000A1Z5"
                          className="uppercase font-mono text-xs"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Billing Email *</Label>
                        <Input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="billing@acme.com"
                          className="text-xs"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Headquarters City</Label>
                      <Input
                        value={regCity}
                        onChange={(e) => setRegCity(e.target.value)}
                        placeholder="Bengaluru"
                        className="text-xs"
                      />
                    </div>

                    <Button type="submit" className="w-full text-xs" disabled={submittingReg}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {submittingReg ? "Registering Organization..." : "Create Corporate Organization"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <Card className="p-4 border-border">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand" /> Why Choose Synchoo Corporate?
                </h3>
                <div className="space-y-3.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2.5">
                    <Receipt className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">100% Compliant GST Invoicing</p>
                      <p>Monthly tax invoices with complete CGST (9%) and SGST (9%) breakdowns for Input Tax Credit claims.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CreditCard className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Prepaid Corporate Mobility Wallet</p>
                      <p>Company pays automatically on booking confirmation. Zero individual expense reports.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Sliders className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Custom Travel Policies</p>
                      <p>Auto-approve in-policy trips; parallel manager and provider approvals for out-of-policy requests.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // View when user IS part of a company
  const currentMonthSpend = trips
    .filter((t) => ["auto", "approved"].includes(t.approval_status))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-10 px-4 sm:px-6 max-w-6xl mx-auto w-full space-y-6">
        {/* Company Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/40"
              >
                <Briefcase className="mr-1 h-3.5 w-3.5" /> Corporate Account
              </Badge>
              {company.verification_status === "approved" ? (
                <Badge className="bg-emerald-600 text-white text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Verified Business
                </Badge>
              ) : company.verification_status === "pending" ? (
                <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-xs">
                  <Clock className="mr-1 h-3 w-3" /> Verification Pending
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  Verification Rejected
                </Badge>
              )}
              {company.status === "paused" && (
                <Badge variant="destructive" className="text-xs">
                  Account Paused (Overdue)
                </Badge>
              )}
              <Badge variant="secondary" className="capitalize text-xs">
                Role: {myMembership?.role} ({myMembership?.department || "General"})
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              {company.name}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              GSTIN: <span className="font-mono">{company.gstin}</span> · City: {company.city} · Billing: {company.billing_email}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-muted/40 p-3 rounded-xl border border-border">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase font-medium">Corporate Wallet</p>
              <p className="text-xl font-bold text-foreground">₹{company.wallet_balance.toLocaleString()}</p>
            </div>
            {company.credit_limit > 0 && (
              <div className="border-l border-border pl-4">
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Credit Limit</p>
                <p className="text-xl font-bold text-foreground">₹{company.credit_limit.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Corporate Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto">
            <TabsTrigger value="overview">Overview & Trips</TabsTrigger>
            <TabsTrigger value="policies">Policies & Limits</TabsTrigger>
            <TabsTrigger value="members">Team Members</TabsTrigger>
            <TabsTrigger value="invoices">GST Invoices</TabsTrigger>
          </TabsList>

          {/* TAB 1: OVERVIEW & TRIPS */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Current Month Spend</p>
                <p className="text-2xl font-bold text-foreground mt-1">₹{currentMonthSpend.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">From real completed/auto trips</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Active Team Members</p>
                <p className="text-2xl font-bold text-foreground mt-1">{members.filter((m) => m.status === "active").length}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Authorized corporate bookers</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Total Corporate Trips</p>
                <p className="text-2xl font-bold text-foreground mt-1">{trips.length}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Across rentals, drivers, washes</p>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Corporate Trips & Approvals</CardTitle>
                  <CardDescription className="text-xs">
                    In-policy trips are auto-approved; out-of-policy trips undergo parallel manager and provider review.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {trips.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No corporate trips booked yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-2.5 px-3">Service</th>
                          <th className="py-2.5 px-3">Amount</th>
                          <th className="py-2.5 px-3">Approval Status</th>
                          <th className="py-2.5 px-3">Respond By</th>
                          <th className="py-2.5 px-3">Audit</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {trips.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/20">
                            <td className="py-3 px-3 font-medium capitalize flex items-center gap-1.5">
                              {t.service_type === "rental" ? (
                                <Car className="h-3.5 w-3.5 text-blue-500" />
                              ) : t.service_type === "driver" ? (
                                <Briefcase className="h-3.5 w-3.5 text-purple-500" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                              )}
                              {t.service_type}
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold">₹{t.amount.toLocaleString()}</td>
                            <td className="py-3 px-3">
                              <Badge
                                variant={
                                  t.approval_status === "auto" || t.approval_status === "approved"
                                    ? "default"
                                    : t.approval_status === "pending"
                                    ? "outline"
                                    : "destructive"
                                }
                                className="text-[10px] capitalize"
                              >
                                {t.approval_status}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-muted-foreground">
                              {t.respond_by ? new Date(t.respond_by).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="py-3 px-3">
                              {t.is_flagged ? (
                                <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-[10px]">
                                  <Flag className="h-2.5 w-2.5 mr-1" /> Flagged
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">Clean</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right space-x-1.5">
                              {isManager && t.approval_status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => handleDecideTrip(t.id, "approve")}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] border-rose-500 text-rose-600 hover:bg-rose-50"
                                    onClick={() => handleDecideTrip(t.id, "reject")}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {isManager && ["auto", "approved"].includes(t.approval_status) && !t.is_flagged && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[11px] text-amber-600 hover:bg-amber-50"
                                  onClick={() => {
                                    setFlaggingTripId(t.id);
                                    setFlagReason("");
                                  }}
                                >
                                  <Flag className="h-3 w-3 mr-1" /> Flag
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Flag Modal Input */}
            {flaggingTripId && (
              <Card className="border-amber-300 bg-amber-50/40 p-4 space-y-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Flag Trip for Corporate Audit
                </p>
                <Input
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="Enter reason (e.g. Non-work related travel, unusual expense)..."
                  className="text-xs bg-white"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={handleFlagTrip}>
                    Submit Flag
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFlaggingTripId(null)}>
                    Cancel
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* TAB 2: POLICIES & LIMITS */}
          <TabsContent value="policies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-brand" /> Company Travel Policy
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure allowed services, daily spending caps, and manager approval thresholds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSavePolicy} className="space-y-4 max-w-lg">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Allowed Services</Label>
                    <div className="flex items-center gap-4">
                      {["rental", "driver", "wash"].map((service) => (
                        <label key={service} className="flex items-center gap-1.5 text-xs capitalize cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editAllowedServices.includes(service)}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditAllowedServices([...editAllowedServices, service]);
                              } else {
                                setEditAllowedServices(editAllowedServices.filter((s) => s !== service));
                              }
                            }}
                          />
                          {service}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max Price Per Day (₹)</Label>
                      <Input
                        type="number"
                        value={editMaxPrice}
                        disabled={!isAdmin}
                        onChange={(e) => setEditMaxPrice(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Approval Threshold (₹)</Label>
                      <Input
                        type="number"
                        value={editThreshold}
                        disabled={!isAdmin}
                        onChange={(e) => setEditThreshold(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {isAdmin && (
                    <Button type="submit" size="sm" className="text-xs" disabled={savingPolicy}>
                      {savingPolicy ? "Saving Policy..." : "Save Policy Changes"}
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: TEAM MEMBERS */}
          <TabsContent value="members" className="space-y-6">
            {isAdmin && (
              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-brand" /> Add Team Member
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-[11px]">User ID / Email *</Label>
                      <Input
                        value={inviteUserId}
                        onChange={(e) => setInviteUserId(e.target.value)}
                        placeholder="user_xxx or employee@acme.com"
                        className="text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Role</Label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as any)}
                        className="w-full text-xs h-9 px-2 rounded-md border border-input bg-background"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Monthly Limit (₹)</Label>
                      <Input
                        type="number"
                        value={inviteLimit}
                        onChange={(e) => setInviteLimit(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <Button type="submit" size="sm" className="text-xs h-9" disabled={inviting}>
                      {inviting ? "Adding..." : "Add Member"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Authorized Company Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 px-3">User</th>
                        <th className="py-2 px-3">Role</th>
                        <th className="py-2 px-3">Department</th>
                        <th className="py-2 px-3">Monthly Limit</th>
                        <th className="py-2 px-3">Status</th>
                        {isAdmin && <th className="py-2 px-3 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {members.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 font-mono">{m.user_id.slice(0, 16)}...</td>
                          <td className="py-2.5 px-3 capitalize font-medium">{m.role}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{m.department || "—"}</td>
                          <td className="py-2.5 px-3 font-mono">₹{m.monthly_limit.toLocaleString()}</td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={m.status === "active" ? "default" : "secondary"}
                              className="text-[10px] capitalize"
                            >
                              {m.status}
                            </Badge>
                          </td>
                          {isAdmin && (
                            <td className="py-2.5 px-3 text-right">
                              {m.status === "active" && m.user_id !== currentUser?.id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-rose-600 hover:bg-rose-50 p-1"
                                  onClick={() => handleRemoveMember(m.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: GST INVOICES */}
          <TabsContent value="invoices" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Consolidated Monthly GST Invoices</h3>
                <p className="text-xs text-muted-foreground">
                  Official GST tax invoices featuring 18% Input Tax Credit breakdown (9% CGST + 9% SGST).
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" className="text-xs" onClick={handleGenerateInvoice}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Generate Current Month Invoice
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="pt-6">
                {invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No invoices generated yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-2 px-3">Invoice #</th>
                          <th className="py-2 px-3">Month</th>
                          <th className="py-2 px-3">Base Amount</th>
                          <th className="py-2 px-3">CGST (9%)</th>
                          <th className="py-2 px-3">SGST (9%)</th>
                          <th className="py-2 px-3">Total Amount</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-muted/20">
                            <td className="py-2.5 px-3 font-mono font-medium">{inv.invoice_number}</td>
                            <td className="py-2.5 px-3">{inv.month}</td>
                            <td className="py-2.5 px-3 font-mono">₹{inv.base_amount.toLocaleString()}</td>
                            <td className="py-2.5 px-3 font-mono text-muted-foreground">₹{inv.cgst.toLocaleString()}</td>
                            <td className="py-2.5 px-3 font-mono text-muted-foreground">₹{inv.sgst.toLocaleString()}</td>
                            <td className="py-2.5 px-3 font-mono font-bold">₹{inv.total.toLocaleString()}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant={inv.status === "paid" ? "default" : "destructive"} className="text-[10px] capitalize">
                                {inv.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
