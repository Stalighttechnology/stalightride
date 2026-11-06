import { createFileRoute } from "@tanstack/react-router";
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
  FileSpreadsheet,
  CheckCircle2,
  Receipt,
  Car,
  ShieldCheck,
  Plus,
  Trash2,
  TrendingUp,
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
}

export function CorporatePage() {
  const [registered, setRegistered] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [city, setCity] = useState("Bangalore");
  const [teamSize, setTeamSize] = useState("25");

  // Corporate Portal State
  const [employees, setEmployees] = useState<Employee[]>([
    { id: "e1", name: "Siddharth Verma", email: "siddharth@acme.com", department: "Engineering", monthlyLimit: 15000 },
    { id: "e2", name: "Ananya Iyer", email: "ananya@acme.com", department: "Sales", monthlyLimit: 25000 },
    { id: "e3", name: "Vikram Malhotra", email: "vikram@acme.com", department: "Operations", monthlyLimit: 10000 },
  ]);

  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpDept, setNewEmpDept] = useState("Marketing");
  const [newEmpLimit, setNewEmpLimit] = useState("12000");

  const handleRegisterCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !gstin.trim() || !workEmail.trim()) {
      return toast.error("Please fill in company name, GSTIN, and business email");
    }
    setRegistered(true);
    toast.success("Corporate account verified! Welcome to Synchoo Business.");
  };

  const handleAddEmployee = (e: React.FormEvent) => {
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
    };
    setEmployees([...employees, emp]);
    setNewEmpName("");
    setNewEmpEmail("");
    toast.success(`${emp.name} added to corporate travel group!`);
  };

  const handleRemoveEmployee = (id: string) => {
    setEmployees(employees.filter((e) => e.id !== id));
    toast.success("Employee removed from corporate roster");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl text-center space-y-4">
          <Badge variant="outline" className="border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/40">
            <Briefcase className="mr-1 h-3.5 w-3.5" /> Synchoo For Business
          </Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Seamless Corporate Mobility & Travel Expenses
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Empower your team with on-demand self-drive rentals, chauffeur hires, and carpooling with centralized company invoicing, monthly GST input tax credit, and custom spend limits.
          </p>
        </div>

        {!registered ? (
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
          <div className="mx-auto max-w-5xl mt-10 space-y-6">
            {/* Business Info Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600">
                  <Building className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-bold">{companyName}</h2>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> GST Verified
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    GSTIN: <span className="font-mono">{gstin}</span> · Admin: {workEmail} · {city}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.success("Consolidated GST Invoice downloaded!")}>
                  <Receipt className="mr-1.5 h-3.5 w-3.5" /> Download Monthly GST Invoice
                </Button>
              </div>
            </div>

            {/* Corporate Spend Overview */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <span className="text-xs text-muted-foreground">Monthly Budget Cap</span>
                <p className="font-display text-2xl font-bold mt-1 text-foreground">₹1,50,000</p>
              </Card>
              <Card className="p-4">
                <span className="text-xs text-muted-foreground">Current Month Spend</span>
                <p className="font-display text-2xl font-bold mt-1 text-brand">₹42,300</p>
              </Card>
              <Card className="p-4">
                <span className="text-xs text-muted-foreground">Active Employees</span>
                <p className="font-display text-2xl font-bold mt-1 text-foreground">{employees.length}</p>
              </Card>
              <Card className="p-4">
                <span className="text-xs text-muted-foreground">GST Saved (18%)</span>
                <p className="font-display text-2xl font-bold mt-1 text-emerald-600">₹7,614</p>
              </Card>
            </div>

            {/* Employee Allowance Manager */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand" /> Manage Team Roster & Monthly Limits
                </CardTitle>
                <CardDescription>
                  Employees can book rides using the corporate billing method within their assigned monthly allowance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <div className="grid gap-2 pt-2">
                  {employees.map((emp) => (
                    <Card key={emp.id} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{emp.name}</p>
                          <Badge variant="outline" className="text-[10px]">{emp.department}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {emp.email} · Spend Cap: <span className="font-semibold text-foreground">{currency(emp.monthlyLimit)}/month</span>
                        </p>
                      </div>

                      <Button size="sm" variant="ghost" onClick={() => handleRemoveEmployee(emp.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

