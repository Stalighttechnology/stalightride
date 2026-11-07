import { useState } from "react";
import { ComingSoonBanner, comingSoon } from "@/components/coming-soon";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  Wrench,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Car,
  FileCheck,
  IndianRupee,
} from "lucide-react";

interface MaintenanceLog {
  id: string;
  vehicleTitle: string;
  serviceType: string;
  date: string;
  cost: number;
  workshop: string;
  odometer: number;
  notes?: string;
}

interface DocumentExpiry {
  docName: string;
  vehicleTitle: string;
  expiryDate: string;
  daysRemaining: number;
  status: "valid" | "warning" | "expired";
}

const INITIAL_LOGS: MaintenanceLog[] = [
  {
    id: "m1",
    vehicleTitle: "Hyundai Creta SX (O)",
    serviceType: "Periodic 20,000 km Service",
    date: "2026-10-15",
    cost: 4800,
    workshop: "Advaith Hyundai Service, Koramangala",
    odometer: 19850,
    notes: "Engine oil, oil filter, air filter replaced. Brake fluid topped up.",
  },
  {
    id: "m2",
    vehicleTitle: "Tata Nexon EV Max",
    serviceType: "Tire Rotation & Wheel Alignment",
    date: "2026-10-28",
    cost: 1200,
    workshop: "MRF Tyres Hub, HSR Layout",
    odometer: 14200,
    notes: "Front tires rotated to rear. Nitrogen filled.",
  },
];

const DOCUMENT_EXPIRIES: DocumentExpiry[] = [
  { docName: "PUC Certificate", vehicleTitle: "Hyundai Creta SX (O)", expiryDate: "2026-11-20", daysRemaining: 14, status: "warning" },
  { docName: "Commercial Insurance", vehicleTitle: "Hyundai Creta SX (O)", expiryDate: "2027-04-12", daysRemaining: 157, status: "valid" },
  { docName: "Fitness Certificate", vehicleTitle: "Tata Nexon EV Max", expiryDate: "2026-12-05", daysRemaining: 29, status: "warning" },
];

export function VendorMaintenanceTab({ vehicles }: { vehicles: any[] }) {
  const [logs, setLogs] = useState<MaintenanceLog[]>(INITIAL_LOGS);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [selectedVehicle, setSelectedVehicle] = useState(vehicles?.[0]?.title || "Vehicle");
  const [serviceType, setServiceType] = useState("Periodic Service");
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [cost, setCost] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [odometer, setOdometer] = useState("20000");
  const [notes, setNotes] = useState("");

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    comingSoon();
    return;
    e.preventDefault();
    if (!cost || Number(cost) <= 0) return toast.error("Please enter a valid service cost");

    const newLog: MaintenanceLog = {
      id: String(Date.now()),
      vehicleTitle: selectedVehicle,
      serviceType: serviceType.trim(),
      date: serviceDate,
      cost: Number(cost),
      workshop: workshop.trim() || "Local Garage",
      odometer: Number(odometer) || 0,
      notes: notes.trim() || undefined,
    };

    setLogs([newLog, ...logs]);
    setShowAddForm(false);
    setCost("");
    setNotes("");
    toast.success("Maintenance service logged successfully!");
  };

  const handleDeleteLog = (id: string) => {
    comingSoon();
    return;
    setLogs(logs.filter((l) => l.id !== id));
    toast.success("Maintenance record deleted");
  };

  const totalExpense = logs.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="space-y-6">
      <ComingSoonBanner feature="Fleet maintenance tracking" />
      {/* Expiry Reminders Bar */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-brand" /> Document Expiry & Service Due Alerts
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {DOCUMENT_EXPIRIES.map((d, i) => (
            <Card key={i} className="p-3.5 border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-xs text-foreground">{d.docName}</p>
                  <p className="text-[11px] text-muted-foreground">{d.vehicleTitle}</p>
                </div>
                <Badge
                  variant={d.status === "warning" ? "destructive" : "outline"}
                  className={d.status === "warning" ? "bg-amber-50 text-amber-700 border-amber-300 text-[10px]" : "text-[10px]"}
                >
                  {d.daysRemaining} days left
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Expires on {d.expiryDate}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Expense Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Total Maintenance Spent</span>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(totalExpense)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Total Services Logged</span>
          <p className="font-display text-2xl font-bold mt-1 text-brand">{logs.length}</p>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <span className="text-xs text-muted-foreground">Avg Cost / Service</span>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">
            {currency(logs.length ? Math.round(totalExpense / logs.length) : 0)}
          </p>
        </Card>
      </div>

      {/* Maintenance History & Add Button */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4 text-brand" /> Service & Repair History
          </h3>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Service / Repair
          </Button>
        </div>

        {showAddForm && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Record Maintenance or Repair Event</CardTitle>
              <CardDescription className="text-xs">
                Keep track of mechanical service, oil changes, tyre replacements, and workshop invoices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddLog} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Vehicle</Label>
                    <select
                      value={selectedVehicle}
                      onChange={(e) => setSelectedVehicle(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                    >
                      {(vehicles || []).map((v) => (
                        <option key={v.id} value={v.title}>
                          {v.title}
                        </option>
                      ))}
                      <option value="General Fleet">General Fleet</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Service Type</Label>
                    <Input
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value)}
                      placeholder="e.g. Oil Change, Brake Pads"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Service Date</Label>
                    <Input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Cost (₹) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="3500"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Workshop / Garage Name</Label>
                    <Input
                      value={workshop}
                      onChange={(e) => setWorkshop(e.target.value)}
                      placeholder="Advaith Motors"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Odometer Reading (km)</Label>
                    <Input
                      type="number"
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value)}
                      placeholder="21000"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes / Replaced Parts</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Synthetic oil 5W-30, new oil filter, wheel balanced"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save Record
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-2.5">
          {logs.map((log) => (
            <Card key={log.id} className="p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{log.serviceType}</p>
                    <Badge variant="outline" className="text-[10px]">{log.vehicleTitle}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {log.date} · {log.workshop} · Odo: {log.odometer.toLocaleString()} km
                  </p>
                  {log.notes && <p className="text-xs text-foreground mt-1.5">{log.notes}</p>}
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-foreground">{currency(log.cost)}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteLog(log.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

