import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { SupportTicketForm } from "@/components/support-ticket-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ShieldAlert,
  PhoneCall,
  Wrench,
  FileText,
  AlertTriangle,
  UserCheck,
  PackageSearch,
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
  Car,
  HeartHandshake,
  HelpCircle,
  ShieldCheck,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/safety")({
  component: SafetyCenterPage,
  head: () => ({
    meta: [
      { title: "Safety Center — Synchoo" },
      { name: "description", content: "24/7 Safety Command Center, SOS assistance, accident reporting, breakdown support, and insurance guidelines on Synchoo." },
    ],
  }),
});

interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
}

export function SafetyCenterPage() {
  const { user } = useSession();

  // Incident report form
  const [incidentType, setIncidentType] = useState("accident");
  const [incidentBookingId, setIncidentBookingId] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [incidentDesc, setIncidentDesc] = useState("");
  const [submittingIncident, setSubmittingIncident] = useState(false);

  // Lost & Found form
  const [lostItemName, setLostItemName] = useState("");
  const [lostTripId, setLostTripId] = useState("");
  const [lostDesc, setLostDesc] = useState("");
  const [submittingLost, setSubmittingLost] = useState(false);

  // Emergency contacts state
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactRelation, setNewContactRelation] = useState("Parent");
  const [newContactPhone, setNewContactPhone] = useState("");

  const loadTrustedContacts = async () => {
    if (!user) return;
    const { data } = await api
      .from("trusted_contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (data) {
      setContacts(
        data.map((c) => ({
          id: c.id,
          name: c.name,
          relationship: c.relationship || "Contact",
          phone: c.phone,
        }))
      );
    }
  };

  useEffect(() => {
    loadTrustedContacts();
  }, [user?.id]);

  const handleIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return toast.error("Please sign in to report an incident");
    }
    if (!incidentDesc.trim()) {
      return toast.error("Provide incident description");
    }
    setSubmittingIncident(true);

    const { error } = await api.from("incidents").insert({
      reporter_id: user.id,
      type: incidentType,
      booking_id: incidentBookingId.trim() || null,
      location_text: incidentLocation.trim() || null,
      description: incidentDesc.trim(),
      status: "open",
    });

    setSubmittingIncident(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Incident report filed! Our 24/7 Safety Team has been notified and will call you.");
    setIncidentBookingId("");
    setIncidentLocation("");
    setIncidentDesc("");
  };

  const handleLostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return toast.error("Please sign in to file a lost & found report");
    }
    if (!lostItemName.trim()) {
      return toast.error("Provide item name");
    }
    setSubmittingLost(true);

    const { error } = await api.from("incidents").insert({
      reporter_id: user.id,
      type: "lost_item",
      booking_id: lostTripId.trim() || null,
      item_name: lostItemName.trim(),
      description: lostDesc.trim() || null,
      status: "open",
    });

    setSubmittingLost(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Lost & Found report submitted! We have notified your vehicle host.");
    setLostItemName("");
    setLostTripId("");
    setLostDesc("");
  };

  const addEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return toast.error("Please sign in to save emergency contacts");
    }
    if (!newContactName.trim() || !newContactPhone.trim()) {
      return toast.error("Provide contact name and phone number");
    }

    const { data, error } = await api
      .from("trusted_contacts")
      .insert({
        user_id: user.id,
        name: newContactName.trim(),
        relationship: newContactRelation,
        phone: newContactPhone.trim(),
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    setContacts([
      ...contacts,
      {
        id: data.id,
        name: data.name,
        relationship: data.relationship || "Contact",
        phone: data.phone,
      },
    ]);
    setNewContactName("");
    setNewContactPhone("");
    toast.success("Trusted emergency contact saved!");
  };

  const removeContact = async (id: string) => {
    const { error } = await api.from("trusted_contacts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setContacts(contacts.filter((c) => c.id !== id));
    toast.success("Emergency contact removed");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <div className="border-b border-border bg-gradient-to-b from-red-50/50 via-background to-background dark:from-red-950/20 py-12 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl text-center space-y-3">
            <Badge variant="outline" className="border-red-300 text-red-600 bg-red-50 dark:bg-red-950/40">
              <ShieldAlert className="mr-1 h-3.5 w-3.5" /> 24/7 Safety Command Hub
            </Badge>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Your Safety Is Our Uncompromising Priority
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Whether you are on a weekend self-drive rental, carpooling intercity, or using our driver service, Synchoo provides around-the-clock protection and immediate roadside response.
            </p>

            {/* Quick Emergency Numbers */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="destructive"
                className="h-10 px-5 shadow-xs"
                onClick={() => window.open("tel:112", "_self")}
              >
                <PhoneCall className="mr-2 h-4 w-4" /> Police SOS: 112
              </Button>
              <Button
                variant="outline"
                className="h-10 px-5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200"
                onClick={() => window.open("tel:+918045678900", "_self")}
              >
                <PhoneCall className="mr-2 h-4 w-4 text-amber-600" /> Synchoo Safety Desk: +91 80 4567 8900
              </Button>
              <Button
                variant="outline"
                className="h-10 px-5"
                onClick={() => window.open("tel:108", "_self")}
              >
                <PhoneCall className="mr-2 h-4 w-4 text-red-500" /> Ambulance: 108
              </Button>
            </div>
          </div>
        </div>

        {/* Safety Navigation Sidebar & Content */}
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Tabs defaultValue="breakdown" className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <aside className="lg:col-span-1 space-y-4">
              <div className="sticky top-20 space-y-4">
                <Card className="p-4 border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-2 font-semibold text-sm text-red-600">
                    <ShieldAlert className="h-4 w-4" /> 24/7 Safety Command
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Live telemetry, accident response, and roadside recovery nationwide.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full mt-3 text-xs"
                    onClick={() => window.open("tel:112", "_self")}
                  >
                    <PhoneCall className="mr-1.5 h-3.5 w-3.5" /> Emergency SOS (112)
                  </Button>
                </Card>

                <TabsList className="flex flex-row lg:flex-col w-full h-auto bg-transparent p-0 gap-1.5 overflow-x-auto no-scrollbar inapp-scroll pb-2 lg:pb-0 justify-start">
                  <TabsTrigger
                    value="breakdown"
                    className="w-full justify-start text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-border bg-card data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand whitespace-nowrap"
                  >
                    <Wrench className="mr-2 h-4 w-4 shrink-0" /> Roadside & Breakdown
                  </TabsTrigger>
                  <TabsTrigger
                    value="incident"
                    className="w-full justify-start text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-border bg-card data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand whitespace-nowrap"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4 shrink-0" /> Report Incident / Accident
                  </TabsTrigger>
                  <TabsTrigger
                    value="lost"
                    className="w-full justify-start text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-border bg-card data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand whitespace-nowrap"
                  >
                    <HelpCircle className="mr-2 h-4 w-4 shrink-0" /> Lost & Found
                  </TabsTrigger>
                  <TabsTrigger
                    value="insurance"
                    className="w-full justify-start text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-border bg-card data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand whitespace-nowrap"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4 shrink-0" /> Insurance Coverage
                  </TabsTrigger>
                  <TabsTrigger
                    value="contacts"
                    className="w-full justify-start text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-border bg-card data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand whitespace-nowrap"
                  >
                    <Users className="mr-2 h-4 w-4 shrink-0" /> Emergency Contacts
                  </TabsTrigger>
                </TabsList>
              </div>
            </aside>

            <div className="lg:col-span-3">
              {/* Tab 1: Roadside & Breakdown */}
            <TabsContent value="breakdown" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand mb-3">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-sm">Flat Tyre Support</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Spare tyre replacement assistance or puncture repair technician dispatched to your location within 30-45 minutes.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-4 text-xs"
                    onClick={() => window.open("tel:+918045678900", "_self")}
                  >
                    Request Tyre Assist
                  </Button>
                </Card>

                <Card className="p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand mb-3">
                    <Car className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-sm">Battery Jumpstart</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dead battery? Mobile mechanic with industrial jumper cables will get your engine running on the spot.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-4 text-xs"
                    onClick={() => window.open("tel:+918045678900", "_self")}
                  >
                    Request Jumpstart
                  </Button>
                </Card>

                <Card className="p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand mb-3">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-sm">Flatbed Towing Support</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Safe hydraulic flatbed vehicle towing to the nearest authorized OEM brand service center across India.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-4 text-xs"
                    onClick={() => window.open("tel:+918045678900", "_self")}
                  >
                    Request Flatbed Tow
                  </Button>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 2: Report Incident */}
            <TabsContent value="incident">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" /> File Incident or Accident Report
                  </CardTitle>
                  <CardDescription>
                    Submit official accident or damage details. Our emergency claims manager will liaise with host and insurer.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleIncidentSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Incident Classification *</Label>
                        <select
                          value={incidentType}
                          onChange={(e) => setIncidentType(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
                        >
                          <option value="accident">Collision / Road Accident</option>
                          <option value="breakdown">Engine / Mechanical Failure</option>
                          <option value="theft">Vandalism / Stolen Part</option>
                          <option value="dispute">Unsafe Host / Driver Behavior</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Booking ID or Vehicle No *</Label>
                        <Input
                          value={incidentBookingId}
                          onChange={(e) => setIncidentBookingId(e.target.value)}
                          placeholder="e.g. 550e8400 or KA-01-AB-1234"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Location of Incident *</Label>
                      <Input
                        value={incidentLocation}
                        onChange={(e) => setIncidentLocation(e.target.value)}
                        placeholder="e.g. Bangalore-Mysore Expressway, near Mandya Toll"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Describe what happened *</Label>
                      <Textarea
                        rows={3}
                        value={incidentDesc}
                        onChange={(e) => setIncidentDesc(e.target.value)}
                        placeholder="Details of the event, third-party vehicle details, injuries (if any), and vehicle drivability status."
                        required
                      />
                    </div>

                    <Button type="submit" disabled={submittingIncident}>
                      {submittingIncident ? "Submitting..." : "Submit Incident Report to Claims Desk"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 3: Lost & Found */}
            <TabsContent value="lost">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PackageSearch className="h-4 w-4 text-brand" /> Lost & Found Assistance
                  </CardTitle>
                  <CardDescription>
                    Left sunglasses, wallet, chargers, or luggage in a Synchoo vehicle? We will coordinate recovery with the host.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLostSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Item Description *</Label>
                        <Input
                          value={lostItemName}
                          onChange={(e) => setLostItemName(e.target.value)}
                          placeholder="e.g. Black RayBan Sunglasses in glove box"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Trip Reference / Date *</Label>
                        <Input
                          value={lostTripId}
                          onChange={(e) => setLostTripId(e.target.value)}
                          placeholder="e.g. Hyundai Creta trip on 5th Nov"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Where in vehicle was it left?</Label>
                      <Textarea
                        rows={2}
                        value={lostDesc}
                        onChange={(e) => setLostDesc(e.target.value)}
                        placeholder="Boot space, rear seat pocket, glove compartment, etc."
                      />
                    </div>

                    <Button type="submit" disabled={submittingLost}>
                      {submittingLost ? "Submitting..." : "Submit Lost Item Claim"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: Insurance Coverage */}
            <TabsContent value="insurance" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm mb-2">
                    <CheckCircle2 className="h-4 w-4" /> Comprehensive Protection Included
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li>• <strong>Third-Party Liability:</strong> Coverage up to ₹50,00,000 for any third-party vehicle or property damage.</li>
                    <li>• <strong>Zero Depreciation:</strong> Nil-depreciation cover on plastic, glass, and metal repairs in case of collision.</li>
                    <li>• <strong>Cashless Repairs:</strong> Tie-up with 4,000+ authorized workshops nationwide.</li>
                  </ul>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-sm mb-2">
                    <Lock className="h-4 w-4 text-brand" /> Renter Maximum Liability Cap
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    In the event of accidental damage during an authorized trip complying with Terms of Service, your financial liability is strictly capped at the refundable security deposit amount (typically ₹3,000 to ₹5,000). Synchoo insurance absorbs all costs exceeding the deductible cap.
                  </p>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 5: Trusted Emergency Contacts */}
            <TabsContent value="contacts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-brand" /> Trusted Emergency Contacts
                  </CardTitle>
                  <CardDescription>
                    These contacts will be immediately pinged with your live trip tracker and emergency location if SOS is triggered.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={addEmergencyContact} className="grid gap-3 sm:grid-cols-4 items-end">
                    <div>
                      <Label className="text-xs">Contact Name</Label>
                      <Input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Anita Sharma" required />
                    </div>
                    <div>
                      <Label className="text-xs">Relationship</Label>
                      <Input value={newContactRelation} onChange={(e) => setNewContactRelation(e.target.value)} placeholder="Sister / Spouse" />
                    </div>
                    <div>
                      <Label className="text-xs">Phone Number</Label>
                      <Input value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} placeholder="+91 98765 43210" required />
                    </div>
                    <Button type="submit">
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Contact
                    </Button>
                  </form>

                  <div className="grid gap-2">
                    {contacts.map((c) => (
                      <Card key={c.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.relationship} · {c.phone}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeContact(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

