import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, ShieldAlert, Phone, Clock, Percent, IndianRupee, Save } from "lucide-react";

export function PlatformSettingsTab() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [instantConfirmDefault, setInstantConfirmDefault] = useState(true);
  const [gstRate, setGstRate] = useState("18");
  const [sosPhone, setSosPhone] = useState("+91 80 4567 8900");
  const [advanceDriverHours, setAdvanceDriverHours] = useState("2");
  const [maxWalletTopup, setMaxWalletTopup] = useState("200000");
  const [saving, setSaving] = useState(false);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Platform global settings updated successfully!");
    }, 400);
  };

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-brand" /> System Operational Parameters
          </CardTitle>
          <CardDescription>
            Configure platform-wide rules, security thresholds, taxes, and customer emergency assistance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="space-y-6">
            {/* System Switches */}
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border p-3.5">
                <div>
                  <Label className="text-xs font-semibold">Maintenance Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, only administrators can access booking and booking creation is paused.
                  </p>
                </div>
                <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border p-3.5">
                <div>
                  <Label className="text-xs font-semibold">Enable Instant Confirmation by Default</Label>
                  <p className="text-xs text-muted-foreground">
                    Directs rental bookings to payment without requiring manual host approval.
                  </p>
                </div>
                <Switch checked={instantConfirmDefault} onCheckedChange={setInstantConfirmDefault} />
              </div>
            </div>

            {/* Tax & Threshold Inputs */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" /> GST Rate (%)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="28"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">Applied automatically in checkout invoice breakdown.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> 24/7 Emergency SOS Helpline
                </Label>
                <Input
                  value={sosPhone}
                  onChange={(e) => setSosPhone(e.target.value)}
                  placeholder="+91 80 4567 8900"
                  required
                />
                <p className="text-[11px] text-muted-foreground">Connected to rider safety center and app SOS triggers.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Min Driver Advance Notice (Hours)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="48"
                  value={advanceDriverHours}
                  onChange={(e) => setAdvanceDriverHours(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">Minimum lead time before a driver can be booked.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" /> Max Wallet Top-Up (₹)
                </Label>
                <Input
                  type="number"
                  min="1000"
                  max="500000"
                  value={maxWalletTopup}
                  onChange={(e) => setMaxWalletTopup(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">Maximum single Razorpay top-up transaction limit.</p>
              </div>
            </div>

            <Button type="submit" disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Platform Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
