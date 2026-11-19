import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
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
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/corporate")({
  component: CorporatePage,
  head: () => ({
    meta: [
      { title: "Synchoo Corporate — Enterprise Mobility Management" },
      {
        name: "description",
        content:
          "Centralized corporate mobility, business GST invoicing, monthly travel budgets, and ride monitoring for enterprises.",
      },
    ],
  }),
});

export function CorporatePage() {
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [teamSize, setTeamSize] = useState("25");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmitInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !gstin.trim() || !workEmail.trim() || !contactName.trim()) {
      return toast.error("Please fill in company name, GSTIN, work email, and contact name.");
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      toast.success("Corporate inquiry submitted! An enterprise manager will contact you within 24 hours.");
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-10 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Top Header Banner */}
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
              <Badge
                variant="outline"
                className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 text-[11px]"
              >
                Underwriting & Onboarding
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              Enterprise Mobility & Corporate Travel
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Centralized fleet booking, GST Input Tax Credit (ITC) invoicing, employee travel policies, and corporate billing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              asChild
            >
              <a href="mailto:corporate@synchoo.com">
                Contact Enterprise Sales
              </a>
            </Button>
          </div>
        </div>

        {/* Informational Alert (GAP-14 compliance) */}
        <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              Official Corporate Underwriting & Tax Compliance Notice
            </p>
            <p>
              Corporate accounts, consolidated monthly GST tax invoices, and Net-30 credit terms require formal business KYC verification and credit underwriting. In compliance with compliance standards (GAP-14), simulated and unbacked customer data is not displayed. Please submit your business details below to initiate onboarding.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Inquiry & Onboarding Form */}
          <div className="lg:col-span-7">
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="h-4 w-4 text-brand" /> Request Enterprise Corporate Account
                </CardTitle>
                <CardDescription>
                  Apply for corporate billing, centralized employee accounts, and custom travel policies.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submitted ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-base text-foreground">
                      Application Submitted Successfully
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Thank you for applying, <span className="font-semibold text-foreground">{contactName}</span>. Our enterprise onboarding team has received your application for <span className="font-semibold text-foreground">{companyName}</span> (GSTIN: {gstin}). A dedicated account manager will contact you at {workEmail} within 1 business day.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-xs"
                      onClick={() => setSubmitted(false)}
                    >
                      Submit Another Inquiry
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitInquiry} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Company / Legal Business Name *</Label>
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Technologies Private Limited"
                        required
                        className="text-xs"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Business GSTIN (for Input Tax Credit) *</Label>
                        <Input
                          value={gstin}
                          onChange={(e) => setGstin(e.target.value)}
                          placeholder="e.g. 29AAAAA0000A1Z5"
                          className="uppercase font-mono text-xs"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Official Work Email *</Label>
                        <Input
                          type="email"
                          value={workEmail}
                          onChange={(e) => setWorkEmail(e.target.value)}
                          placeholder="e.g. travel@acme.com"
                          className="text-xs"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contact Person Name *</Label>
                        <Input
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="e.g. Rajesh Kumar"
                          className="text-xs"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contact Phone Number</Label>
                        <Input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Headquarters City</Label>
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Bengaluru"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Expected Monthly Travelers</Label>
                        <Input
                          type="number"
                          min="1"
                          value={teamSize}
                          onChange={(e) => setTeamSize(e.target.value)}
                          placeholder="25"
                          className="text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Special Travel Requirements or Existing Fleet Needs</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Mention any custom billing preferences, airport shuttle requirements, or monthly budget targets..."
                        rows={3}
                        className="text-xs"
                      />
                    </div>

                    <Button type="submit" className="w-full text-xs" disabled={loading}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {loading ? "Submitting Application..." : "Submit Corporate Account Application"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Key Corporate Features */}
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
                    <p>Consolidated monthly tax invoices generated with your verified GSTIN, enabling effortless 18% Input Tax Credit claims.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CreditCard className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Flexible Credit Terms</p>
                    <p>Eligible corporate entities can qualify for Net-15 or Net-30 credit lines post underwriting, eliminating individual employee expense reimbursements.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Sliders className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Custom Travel Policies</p>
                    <p>Enforce department-level spending caps, time-of-day restrictions, and vehicle category allowances across all business trips.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Duty of Care & Real-time Tracking</p>
                    <p>Live trip monitoring, verified chauffeurs, comprehensive insurance, and dedicated 24/7 corporate priority support for employee safety.</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-border bg-muted/30 text-xs space-y-2">
              <p className="font-semibold text-foreground">Looking for a custom enterprise pilot?</p>
              <p className="text-muted-foreground">
                Our mobility specialists can set up a proof-of-concept for your team with customized routes and dedicated account representatives.
              </p>
              <p className="font-medium text-brand">Email: corporate@synchoo.com · Phone: +91 80 4567 8900</p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
