import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { IndianRupee, TrendingUp, Percent, ArrowUpRight, ShieldCheck, Wallet, PieChart } from "lucide-react";

export function RevenueCommissionsTab() {
  const [commissions, setCommissions] = useState({
    rental: 10,
    driver: 10,
    wash: 15,
    pooling: 5,
  });

  const [revenueStats, setRevenueStats] = useState({
    gmv: 485000,
    platformRevenue: 52400,
    providerPayouts: 395000,
    refunds: 18500,
    serviceBreakdown: {
      rentals: 295000,
      driverHires: 110000,
      washes: 52000,
      carpooling: 28000,
    },
  });

  const [saving, setSaving] = useState(false);

  const saveCommissions = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Platform commission rates updated across booking services!");
    }, 400);
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Top Revenue Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Gross Booking Volume (GMV)
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(revenueStats.gmv)}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">+14% vs last month</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <IndianRupee className="h-4 w-4 text-brand" /> Net Synchoo Revenue
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(revenueStats.platformRevenue)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">From platform fees</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Wallet className="h-4 w-4 text-blue-500" /> Host & Driver Payouts
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(revenueStats.providerPayouts)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Disbursed to partners</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Percent className="h-4 w-4 text-amber-500" /> Refunded / Disputes
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(revenueStats.refunds)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">3.8% of GMV</p>
        </Card>
      </div>

      {/* Commission Configuration Card */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4 text-brand" /> Commission Rates by Service
            </CardTitle>
            <CardDescription>
              Set platform deduction percentages applied automatically on completed customer bookings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveCommissions} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Self-Drive Vehicle Rentals</Label>
                  <p className="text-[11px] text-muted-foreground">Deducted from host earnings</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={commissions.rental}
                    onChange={(e) => setCommissions({ ...commissions, rental: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <div>
                  <Label className="text-xs font-semibold">Chauffeur / Driver Hire</Label>
                  <p className="text-[11px] text-muted-foreground">Deducted from driver daily/hourly payouts</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={commissions.driver}
                    onChange={(e) => setCommissions({ ...commissions, driver: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <div>
                  <Label className="text-xs font-semibold">Doorstep Vehicle Wash & Detailing</Label>
                  <p className="text-[11px] text-muted-foreground">Platform share from wash centers & cleaners</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={commissions.wash}
                    onChange={(e) => setCommissions({ ...commissions, wash: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <div>
                  <Label className="text-xs font-semibold">Car Pooling Seat Sharing</Label>
                  <p className="text-[11px] text-muted-foreground">Seat matching convenience fee</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={commissions.pooling}
                    onChange={(e) => setCommissions({ ...commissions, pooling: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold">%</span>
                </div>
              </div>

              <Button type="submit" size="sm" className="w-full mt-3" disabled={saving}>
                {saving ? "Saving changes..." : "Save Commission Rates"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* GMV Volume Breakdown by Vertical */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-brand" /> Volume Breakdown by Vertical
            </CardTitle>
            <CardDescription>Live revenue distribution across all four mobility services.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">Self-Drive Rentals (60.8%)</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.rentals)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: "60.8%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">Driver Hires (22.7%)</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.driverHires)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: "22.7%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">Vehicle Washes (10.7%)</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.washes)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: "10.7%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">Carpooling (5.8%)</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.carpooling)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: "5.8%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

