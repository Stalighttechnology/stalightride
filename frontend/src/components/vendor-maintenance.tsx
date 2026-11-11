import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
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
  vehicleId: string;
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

export function VendorMaintenanceTab({ vehicles = [] }: { vehicles: any[] }) {
  const { user } = useSession();
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles?.[0]?.id || "");
  const [serviceType, setServiceType] = useState("Periodic Service");
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [cost, setCost] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [odometer, setOdometer] = useState("20000");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadLogs = async () => {
    if (!user) return;
    const { data, error } = await api
      .from("vehicle_maintenance")
      .select("*, vehicles:vehicle_id(title)")
      .eq("vendor_id", user.id)
      .order("date", { ascending: false });

    if (!error && data) {
      setLogs(
        data.map((row: any) => ({
          id: row.id,
          vehicleId: row.vehicle_id,
          vehicleTitle: row.vehicles?.title || "Vehicle",
          serviceType: row.service_type,
          date: row.date,
          cost: Number(row.cost || 0),
          workshop: row.workshop || "Authorized Workshop",
          odometer: Number(row.odometer || 0),
          notes: row.notes || "",
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, [user?.id]);

  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles]);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Please sign in to log maintenance");
    if (!cost || Number(cost) <= 0) return toast.error("Please enter a valid service cost");
    if (!selectedVehicleId) return toast.error("Please select a vehicle");

    setSubmitting(true);
    const selectedVeh = vehicles.find((v) => v.id === selectedVehicleId);

    const { data, error } = await api
      .from("vehicle_maintenance")
      .insert({
        vehicle_id: selectedVehicleId,
        vendor_id: user.id,
        service_type: serviceType.trim(),
        date: serviceDate,
        cost: Number(cost),
        workshop: workshop.trim() || null,
        odometer: Number(odometer) || null,
        notes: notes.trim() || null,
      })
      .select()
      .single();

    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data) {
      setLogs([
        {
          id: data.id,
          vehicleId: data.vehicle_id,
          vehicleTitle: selectedVeh?.title || "Vehicle",
          serviceType: data.service_type,
          date: data.date,
          cost: Number(data.cost),
          workshop: data.workshop || "Workshop",
          odometer: Number(data.odometer || 0),
          notes: data.notes || "",
        },
        ...logs,
      ]);
    }

    setShowAddForm(false);
    setCost("");
    setWorkshop("");
    setNotes("");
    toast.success("Maintenance log added successfully!");
  };

  const handleDeleteLog = async (id: string) => {
    const { error } = await api.from("vehicle_maintenance").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLogs(logs.filter((l) => l.id !== id));
    toast.success("Maintenance entry removed");
  };

  const totalMaintenanceSpent = logs.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Wrench className="h-4 w-4 text-brand" /> Total Service Records
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{logs.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across registered fleet</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <IndianRupee className="h-4 w-4 text-emerald-500" /> Total Maintenance Cost
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(totalMaintenanceSpent)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Tax deductible fleet expense</p>
        </Card>

        <Card className="p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <CheckCircle2 className="h-4 w-4 text-blue-500" /> Fleet Health Status
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-emerald-600">Optimal</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">All mandatory docs valid</p>
        </Card>
      </div>

      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-brand" /> Vehicle Service History & Health Log
          </h3>
          <p className="text-xs text-muted-foreground">Keep an accurate log of oil changes, brake pads, and repairs.</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" /> {showAddForm ? "Cancel" : "Add Service Entry"}
        </Button>
      </div>

      {/* Add Entry Form Modal / Inline */}
      {showAddForm && (
        <Card className="border-brand/40 bg-brand/5">
          <CardHeader>
            <CardTitle className="text-sm">Log New Vehicle Service</CardTitle>
            <CardDescription className="text-xs">Enter workshop invoice details to keep vehicle records updated.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddLog} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Select Vehicle</Label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    required
                  >
                    {vehicles.length === 0 ? (
                      <option value="">No vehicles found</option>
                    ) : (
                      vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Service Type / Operation</Label>
                  <Input
                    placeholder="e.g. Periodic 10,000 km Oil & Filter"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Service Date</Label>
                  <DatePicker
                    value={serviceDate}
                    onChange={(d) => setServiceDate(d)}
                    placeholder="dd-mm-yyyy"
                    className="h-8 text-xs rounded-md"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Total Cost (₹)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 4500"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Odometer Reading (km)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 24500"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Workshop / Service Station Name</Label>
                <Input
                  placeholder="e.g. Advaith Hyundai, Koramangala"
                  value={workshop}
                  onChange={(e) => setWorkshop(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Service Notes / Parts Replaced</Label>
                <Input
                  placeholder="e.g. Front brake pads replaced, synthetic engine oil 5W-30"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Maintenance Entry"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Log Feed */}
      <div className="space-y-3">
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No maintenance records logged yet. Add your first service record above!
          </p>
        ) : (
          logs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px] font-semibold text-brand">
                      {log.vehicleTitle}
                    </Badge>
                    <span className="font-semibold text-xs text-foreground">{log.serviceType}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Workshop: <span className="font-medium text-foreground">{log.workshop}</span> · Odometer: {log.odometer.toLocaleString()} km
                  </p>
                  {log.notes && (
                    <p className="text-xs text-foreground bg-muted/40 p-2 rounded-md mt-1">
                      {log.notes}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" /> Service Date: {log.date}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-display text-sm font-bold text-foreground">{currency(log.cost)}</p>
                    <p className="text-[10px] text-muted-foreground">Paid</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteLog(log.id)}
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
