import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonBanner, comingSoon } from "@/components/coming-soon";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  Briefcase,
  Building,
  Users,
  CheckCircle2,
  Receipt,
  Car,
  ShieldCheck,
  Plus,
  Trash2,
  TrendingUp,
  LayoutDashboard,
  FileText,
  Sliders,
  Settings,
  Download,
  Search,
  Calendar,
  CreditCard,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/corporate")({
  component: CorporatePage,
  head: () => ({
    meta: [
      { title: "Synchoo Corporate — Enterprise Mobility Management" },
      { name: "description", content: "Centralized employee mobility, business GST invoicing, monthly travel budgets, and ride monitoring for companies." },
    ],
  }),
});

interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  monthlyLimit: number;
  spent: number;
  status: "Active" | "Suspended";
}

interface CorporateTrip {
  id: string;
  employeeName: string;
  service: "Self-drive Rental" | "Chauffeur Hire" | "Carpooling";
  route: string;
  vehicle: string;
  date: string;
  amount: number;
  status: "In Progress" | "Completed" | "Approved";
}

interface MonthlyInvoice {
  id: string;
  month: string;
  tripsCount: number;
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
  status: "Paid" | "Pending Payment";
}

const INITIAL_EMPLOYEES: Employee[] = [
  { id: "e1", name: "Siddharth Verma", email: "siddharth@acme.com", department: "Engineering", monthlyLimit: 15000, spent: 8400, status: "Active" },
  { id: "e2", name: "Ananya Iyer", email: "ananya@acme.com", department: "Sales", monthlyLimit: 25000, spent: 18200, status: "Active" },
  { id: "e3", name: "Vikram Malhotra", email: "vikram@acme.com", department: "Operations", monthlyLimit: 10000, spent: 4100, status: "Active" },
  { id: "e4", name: "Neha Gupta", email: "neha@acme.com", department: "Product", monthlyLimit: 12000, spent: 6300, status: "Active" },
  { id: "e5", name: "Priya Sharma", email: "priya@acme.com", department: "Executive", monthlyLimit: 35000, spent: 12500, status: "Active" },
];

const INITIAL_TRIPS: CorporateTrip[] = [
  {
    id: "SYN-C902",
    employeeName: "Ananya Iyer",
    service: "Chauffeur Hire",
    route: "Kempegowda Intl Airport -> Electronic City Phase 1",
    vehicle: "Toyota Innova Crysta",
    date: "Today, 02:30 PM",
    amount: 2150,
    status: "In Progress",
  },
  {
    id: "SYN-C895",
    employeeName: "Siddharth Verma",
    service: "Self-drive Rental",
    route: "Indiranagar -> Whitefield Tech Corridor (3 Days)",
    vehicle: "Hyundai Creta AT",
    date: "Yesterday",
    amount: 7200,
    status: "Completed",
  },
  {
    id: "SYN-C887",
    employeeName: "Vikram Malhotra",
    service: "Carpooling",
    route: "HSR Layout -> Bellandur EcoSpace",
    vehicle: "Tata Nexon EV",
    date: "04 Nov 2026",
    amount: 320,
    status: "Completed",
  },
  {
    id: "SYN-C879",
    employeeName: "Priya Sharma",
    service: "Chauffeur Hire",
    route: "MG Road -> Devanahalli Business Park",
    vehicle: "Mercedes C-Class",
    date: "02 Nov 2026",
    amount: 4500,
    status: "Completed",
  },
];

const INVOICES: MonthlyInvoice[] = [
  { id: "INV-2026-10", month: "October 2026", tripsCount: 42, baseAmount: 45932, gstAmount: 8268, totalAmount: 54200, status: "Paid" },
  { id: "INV-2026-09", month: "September 2026", tripsCount: 38, baseAmount: 41186, gstAmount: 7414, totalAmount: 48600, status: "Paid" },
  { id: "INV-2026-08", month: "August 2026", tripsCount: 49, baseAmount: 52627, gstAmount: 9473, totalAmount: 62100, status: "Paid" },
];

export function CorporatePage() {
  const [registered, setRegistered] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "employees" | "trips" | "invoices" | "policy" | "settings">("overview");

  // Company Details
  const [companyName, setCompanyName] = useState("Acme Technologies Pvt Ltd");
  const [gstin, setGstin] = useState("29AAAAA0000A1Z5");
  const [workEmail, setWorkEmail] = useState("travel-admin@acme.com");
  const [city, setCity] = useState("Bengaluru");
  const [teamSize, setTeamSize] = useState("25");

  // Roster State
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [trips] = useState<CorporateTrip[]>(INITIAL_TRIPS);
  const [searchMember, setSearchMember] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");

  // New Employee Form
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpDept, setNewEmpDept] = useState("Marketing");
  const [newEmpLimit, setNewEmpLimit] = useState("12000");

  const totalMonthlySpend = employees.reduce((acc, curr) => acc + curr.spent, 0);
  const totalMonthlyBudget = 150000;
  const gstSaved = Math.round(totalMonthlySpend * 0.18);

  const handleRegisterCompany = (e: React.FormEvent) => {
    e.preventDefault();
    comingSoon();
    return;
    e.preventDefault();
    if (!companyName.trim() || !gstin.trim() || !workEmail.trim()) {
      return toast.error("Please fill in company name, GSTIN, and business email");
    }
    setRegistered(true);
    setActiveTab("overview");
    toast.success("Corporate portal activated! Welcome to Synchoo Business.");
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    comingSoon();
    return;
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim()) {
      return toast.error("Enter employee name and work email");
    }
    const emp: Employee = {
      id: String(Date.now()),
      name: newEmpName.trim(),
      email: newEmpEmail.trim(),
      department: newEmpDept,
      monthlyLimit: Number(newEmpLimit) || 10000,
      spent: 0,
      status: "Active",
    };
    setEmployees([...employees, emp]);
    setNewEmpName("");
    setNewEmpEmail("");
    toast.success(`${emp.name} added to corporate travel group!`);
  };

  const handleRemoveEmployee = (id: string) => {
    comingSoon();
    return;
    setEmployees(employees.filter((e) => e.id !== id));
    toast.success("Employee removed from corporate roster");
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(searchMember.toLowerCase()) ||
                          emp.email.toLowerCase().includes(searchMember.toLowerCase());
    const matchesDept = deptFilter === "All" || emp.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const sidebarNavItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "employees", label: "Team & Limits", icon: Users, badge: String(employees.length) },
    { id: "trips", label: "Corporate Trips", icon: Car, badge: "1 Active" },
    { id: "invoices", label: "GST & Invoices", icon: Receipt },
    { id: "policy", label: "Travel Policies", icon: Sliders },
    { id: "settings", label: "Company Profile", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-8 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <ComingSoonBanner feature="Synchoo for Business" />
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/40">
                <Briefcase className="mr-1 h-3.5 w-3.5" /> Synchoo For Business
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Enterprise Beta Preview
              </Badge>
              {registered && (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> GST Ready
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              {registered ? companyName : "Corporate Mobility & Enterprise Travel"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {registered
                ? `GSTIN: ${gstin} · Headquarters: ${city} · Central Invoicing Account`
                : "Centralized employee mobility, business GST invoicing, monthly travel budgets, and ride monitoring."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={registered ? "outline" : "default"}
              onClick={() => {
                setRegistered(!registered);
                toast.info(registered ? "Switched to Enterprise Registration View" : "Switched to Live Corporate Portal View");
              }}
            >
              {registered ? "Register Another Company" : "View Demo Enterprise Portal"}
            </Button>
            {registered && (
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={comingSoon}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download Monthly GST Invoice
              </Button>
            )}
          </div>
        </div>

        {!registered ? (
          /* Registration Form */
          <div className="mx-auto max-w-2xl mt-10">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Register Your Enterprise / Organization</CardTitle>
                <CardDescription>Setup your business account for monthly invoicing and employee allowances.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegisterCompany} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Company / Legal Business Name *</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Technologies Pvt Ltd"
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">GSTIN (for Input Tax Credit) *</Label>
                      <Input
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value)}
                        placeholder="29AAAAA0000A1Z5"
                        className="uppercase font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Official Work Email *</Label>
                      <Input
                        type="email"
                        value={workEmail}
                        onChange={(e) => setWorkEmail(e.target.value)}
                        placeholder="admin@acme.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Headquarters City</Label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Expected Monthly Travelers</Label>
                      <Input
                        type="number"
                        min="1"
                        value={teamSize}
                        onChange={(e) => setTeamSize(e.target.value)}
                        placeholder="25"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full">
                    Activate Corporate Portal
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Corporate Portal with Dedicated Sidebar */
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left Corporate Page Sidebar */}
            <aside className="lg:col-span-1">
              <div className="sticky top-20 space-y-4">
                <Card className="p-4 border-blue-500/20 bg-blue-500/5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                      <Building className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{companyName}</p>
                      <p className="text-xs text-muted-foreground truncate">{city} HQ</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Credit Line:</span>
                    <span className="font-semibold text-emerald-600">Net 30 (Approved)</span>
                  </div>
                </Card>

                {/* Sidebar Navigation Menu */}
                <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto no-scrollbar inapp-scroll pb-2 lg:pb-0" aria-label="Corporate navigation">
                  {sidebarNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap text-left ${
                          isActive
                            ? "bg-brand text-brand-foreground shadow-xs"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-foreground" : "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                        </div>
                        {"badge" in item && (
                          <Badge
                            variant={isActive ? "secondary" : "outline"}
                            className={`text-[10px] px-1.5 py-0 ${
                              isActive ? "bg-white/20 text-brand-foreground border-transparent" : "text-muted-foreground"
                            }`}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </nav>

                {/* Quick Info Box in Sidebar */}
                <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-muted/40">
                  <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-brand" /> 24/7 Corporate Desk
                  </div>
                  Dedicated enterprise priority dispatch & billing support:
                  <div className="mt-2 font-mono text-foreground font-semibold">
                    corporate-support@synchoo.com
                  </div>
                </Card>
              </div>
            </aside>

            {/* Right Main Content Panel */}
            <div className="lg:col-span-3 space-y-6">
              {/* Tab 1: Overview */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card className="p-4">
                      <span className="text-xs text-muted-foreground">Monthly Budget Cap</span>
                      <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(totalMonthlyBudget)}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Utilized: {Math.round((totalMonthlySpend / totalMonthlyBudget) * 100)}%</p>
                    </Card>
                    <Card className="p-4">
                      <span className="text-xs text-muted-foreground">Current Month Spend</span>
                      <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(totalMonthlySpend)}</p>
                      <p className="text-[11px] text-emerald-600 mt-1">Within allocated limit</p>
                    </Card>
                    <Card className="p-4">
                      <span className="text-xs text-muted-foreground">Active Employees</span>
                      <p className="font-display text-2xl font-bold mt-1 text-foreground">{employees.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">4 departments</p>
                    </Card>
                    <Card className="p-4">
                      <span className="text-xs text-muted-foreground">GST Saved (18% ITC)</span>
                      <p className="font-display text-2xl font-bold mt-1 text-emerald-600">{currency(gstSaved)}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">SAC Code 9966</p>
                    </Card>
                  </div>

                  {/* Active Rides Snapshot */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Car className="h-4 w-4 text-brand" /> Live Corporate Travel Snapshot
                        </CardTitle>
                        <CardDescription>Rides currently underway or recently booked on company account</CardDescription>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setActiveTab("trips")}>
                        View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {trips.slice(0, 3).map((trip) => (
                        <div key={trip.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-border bg-card gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{trip.employeeName}</span>
                              <Badge variant="outline" className="text-[10px]">{trip.service}</Badge>
                              {trip.status === "In Progress" ? (
                                <Badge className="bg-blue-600 text-[10px] animate-pulse">Live</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">{trip.status}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" /> {trip.route}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-sm">{currency(trip.amount)}</p>
                            <p className="text-[10px] text-muted-foreground">{trip.date}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Department Spend Allocation */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-brand" /> Department Monthly Spend Allocation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {["Sales", "Engineering", "Executive", "Product", "Operations"].map((dept) => {
                        const deptEmps = employees.filter((e) => e.department === dept);
                        const spent = deptEmps.reduce((acc, curr) => acc + curr.spent, 0);
                        const limit = deptEmps.reduce((acc, curr) => acc + curr.monthlyLimit, 0) || 20000;
                        const pct = Math.min(100, Math.round((spent / limit) * 100));
                        return (
                          <div key={dept} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{dept} ({deptEmps.length} members)</span>
                              <span className="text-muted-foreground">
                                {currency(spent)} / {currency(limit)} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct > 85 ? "bg-amber-500" : "bg-brand"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tab 2: Employees & Limits */}
              {activeTab === "employees" && (
                <div className="space-y-6">
                  {/* Add Employee Form */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-brand" /> Add Team Member to Corporate Account
                      </CardTitle>
                      <CardDescription>
                        Added members can book self-drive cars, hire drivers, and split carpools directly on the company bill.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleAddEmployee} className="grid gap-3 sm:grid-cols-5 items-end">
                        <div>
                          <Label className="text-xs">Employee Name</Label>
                          <Input value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="Neha Gupta" required />
                        </div>
                        <div>
                          <Label className="text-xs">Work Email</Label>
                          <Input type="email" value={newEmpEmail} onChange={(e) => setNewEmpEmail(e.target.value)} placeholder="neha@acme.com" required />
                        </div>
                        <div>
                          <Label className="text-xs">Department</Label>
                          <Input value={newEmpDept} onChange={(e) => setNewEmpDept(e.target.value)} placeholder="Product" />
                        </div>
                        <div>
                          <Label className="text-xs">Monthly Limit (₹)</Label>
                          <Input type="number" min="1000" value={newEmpLimit} onChange={(e) => setNewEmpLimit(e.target.value)} placeholder="15000" required />
                        </div>
                        <Button type="submit">
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Member
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Roster Table */}
                  <Card>
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Active Corporate Roster ({employees.length})</CardTitle>
                        <CardDescription>Manage individual monthly allowances and view month-to-date spend</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Search employee..."
                            value={searchMember}
                            onChange={(e) => setSearchMember(e.target.value)}
                            className="pl-8 h-8 text-xs w-48"
                          />
                        </div>
                        <select
                          value={deptFilter}
                          onChange={(e) => setDeptFilter(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="All">All Departments</option>
                          <option value="Engineering">Engineering</option>
                          <option value="Sales">Sales</option>
                          <option value="Operations">Operations</option>
                          <option value="Product">Product</option>
                          <option value="Executive">Executive</option>
                        </select>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {filteredEmployees.map((emp) => {
                        const pct = Math.round((emp.spent / emp.monthlyLimit) * 100);
                        return (
                          <div key={emp.id} className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm">{emp.name}</p>
                                <Badge variant="outline" className="text-[10px]">{emp.department}</Badge>
                                <Badge variant="secondary" className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40">
                                  {emp.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{emp.email}</p>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                  Spent: <span className="font-medium text-foreground">{currency(emp.spent)}</span> / {currency(emp.monthlyLimit)}
                                </p>
                                <div className="h-1.5 w-28 bg-muted rounded-full overflow-hidden mt-1">
                                  <div
                                    className={`h-full ${pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                              </div>

                              <Button size="sm" variant="ghost" onClick={() => handleRemoveEmployee(emp.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tab 3: Corporate Trips */}
              {activeTab === "trips" && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Car className="h-4 w-4 text-brand" /> Corporate Trips & Bookings
                        </CardTitle>
                        <CardDescription>Live log of employee rides charged to the company billing account</CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {trips.length} Logged Trips
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {trips.map((trip) => (
                        <div key={trip.id} className="p-4 rounded-xl border border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{trip.id}</span>
                              <span className="font-semibold text-sm">{trip.employeeName}</span>
                              <Badge variant="outline" className="text-[10px]">{trip.service}</Badge>
                              {trip.status === "In Progress" ? (
                                <Badge className="bg-blue-600 text-[10px] animate-pulse">Live In Progress</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">{trip.status}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 text-brand shrink-0" /> {trip.route}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Vehicle: <span className="text-foreground">{trip.vehicle}</span> · {trip.date}
                            </p>
                          </div>

                          <div className="text-right flex md:flex-col items-center md:items-end justify-between gap-1">
                            <p className="font-display text-base font-bold text-foreground">{currency(trip.amount)}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7"
                              onClick={comingSoon}
                            >
                              <Download className="mr-1 h-3 w-3" /> Trip Receipt
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tab 4: GST & Invoices */}
              {activeTab === "invoices" && (
                <div className="space-y-6">
                  {/* GST Credit Summary */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
                      <span className="text-xs text-muted-foreground">GSTIN Registered</span>
                      <p className="font-mono text-base font-bold text-foreground mt-1">{gstin}</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">18% Input Tax Credit Eligible</p>
                    </Card>
                    <Card className="p-4">
                      <span className="text-xs text-muted-foreground">Corporate Credit Limit</span>
                      <p className="font-display text-xl font-bold text-foreground mt-1">₹5,00,000</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Payment Terms: Net 30</p>
                    </Card>
                    <Card className="p-4">
                      <span className="text-xs text-muted-foreground">Total ITC Claimed (FY 26-27)</span>
                      <p className="font-display text-xl font-bold text-brand mt-1">{currency(25155)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">SAC Code 9966 (Rent-a-Cab)</p>
                    </Card>
                  </div>

                  {/* Monthly Invoices Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-brand" /> Consolidated Monthly Tax Invoices
                      </CardTitle>
                      <CardDescription>
                        Official GST-compliant tax invoices for accounting, audit and input credit filing
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {INVOICES.map((inv) => (
                        <div key={inv.id} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{inv.month}</span>
                              <span className="font-mono text-xs text-muted-foreground">({inv.id})</span>
                              <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                                {inv.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {inv.tripsCount} employee trips · Base: {currency(inv.baseAmount)} + GST (18%): {currency(inv.gstAmount)}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-display text-base font-bold text-foreground">{currency(inv.totalAmount)}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={comingSoon}
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" /> PDF Invoice
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tab 5: Travel Policy */}
              {activeTab === "policy" && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sliders className="h-4 w-4 text-brand" /> Enterprise Mobility Policies & Rules
                      </CardTitle>
                      <CardDescription>
                        Configure approval thresholds, allowable vehicle categories, and travel window boundaries
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">Self-Drive Rental Classes</span>
                            <Badge variant="outline">Permitted</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Employees may reserve Hatchbacks, Compact SUVs, and Sedans. Premium SUVs (&gt;₹3,500/day) require Manager Pre-Approval.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">Chauffeur & Driver Hire</span>
                            <Badge variant="outline">Permitted</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Available for client meetings, airport transit, and intercity corporate trips. Capped at ₹3,000/day duty.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">Night Travel Window (11 PM - 6 AM)</span>
                            <Badge variant="secondary" className="text-amber-600 bg-amber-50">OTP Verification</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Night pickups automatically notify company travel emergency contact and enable live route tracking.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">Carpooling Split Billing</span>
                            <Badge className="bg-emerald-600">Encouraged</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Employees sharing seats with verified co-workers receive 100% company fare subsidy.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <Button onClick={comingSoon}>
                          Save Policy Changes
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tab 6: Company Profile / Settings */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Settings className="h-4 w-4 text-brand" /> Corporate Organization Profile
                      </CardTitle>
                      <CardDescription>
                        Update business registration, tax billing details, and enterprise administrators
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Company Legal Entity Name</Label>
                          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">GSTIN</Label>
                          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} className="font-mono uppercase" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Primary Billing Email</Label>
                          <Input value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Corporate Headquarters</Label>
                          <Input value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                      </div>

                      <div className="pt-2 flex items-center gap-3">
                        <Button onClick={comingSoon}>
                          Update Organization Settings
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRegistered(false);
                            toast.info("Switched to registration form");
                          }}
                        >
                          Reset / Re-register
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
