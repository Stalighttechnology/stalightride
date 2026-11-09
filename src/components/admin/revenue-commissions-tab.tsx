import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { IndianRupee, TrendingUp, Percent, Wallet, PieChart, Save } from "lucide-react";

export function RevenueCommissionsTab() {
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState({
    rental: 10,
    driver: 10,
    wash: 15,
    pooling: 5,
  });

  const [revenueStats, setRevenueStats] = useState({
    gmv: 0,
    platformRevenue: 0,
    providerPayouts: 0,
    refunds: 0,
    serviceBreakdown: {
      rentals: 0,
      driverHires: 0,
      washes: 0,
      carpooling: 0,
    },
  });

  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    // 1. Fetch commission rates from platform_settings
    const { data: settings } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settings) {
      setCommissions({
        rental: Number(settings.commission_rental_pct ?? 10),
        driver: Number(settings.commission_driver_pct ?? 10),
        wash: Number(settings.commission_wash_pct ?? 15),
        pooling: Number(settings.commission_pool_pct ?? 5),
      });
    }

    // 2. Fetch real aggregates via RPC or DB queries
    const { data: agg, error } = await supabase.rpc("admin_revenue_aggregates");

    if (!error && agg) {
      const a = agg as any;
      setRevenueStats({
        gmv: Number(a.gmv || 0),
        platformRevenue: Number(a.platform_revenue || 0),
        providerPayouts: Number(a.provider_payouts || 0),
        refunds: Number(a.refunds || 0),
        serviceBreakdown: {
          rentals: Number(a.rentals_volume || 0),
          driverHires: Number(a.driver_volume || 0),
          washes: Number(a.wash_volume || 0),
          carpooling: Number(a.pool_volume || 0),
        },
      });
    } else {
      // Fallback: aggregate directly from tables if RPC is pending in local client
      const [bRes, dRes, wRes, pRes] = await Promise.all([
        supabase.from("bookings").select("total_price, refund_amount, payment_status"),
        supabase.from("driver_bookings").select("total_price, refund_amount, payment_status"),
        supabase.from("wash_bookings").select("price, refund_amount, payment_status"),
        supabase.from("payouts").select("amount, status"),
      ]);

      const rentalVol = (bRes.data || [])
        .filter((b) => b.payment_status === "paid")
        .reduce((sum, b) => sum + Number(b.total_price || 0), 0);

      const driverVol = (dRes.data || [])
        .filter((d) => d.payment_status === "paid")
        .reduce((sum, d) => sum + Number(d.total_price || 0), 0);

      const washVol = (wRes.data || [])
        .filter((w) => w.payment_status === "paid")
        .reduce((sum, w) => sum + Number(w.price || 0), 0);

      const payouts = (pRes.data || [])
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const refunds =
        (bRes.data || []).reduce((sum, b) => sum + Number(b.refund_amount || 0), 0) +
        (dRes.data || []).reduce((sum, d) => sum + Number(d.refund_amount || 0), 0) +
        (wRes.data || []).reduce((sum, w) => sum + Number(w.refund_amount || 0), 0);

      const gmv = rentalVol + driverVol + washVol;
      const platformRev =
        rentalVol * (commissions.rental / 100) +
        driverVol * (commissions.driver / 100) +
        washVol * (commissions.wash / 100);

      setRevenueStats({
        gmv,
        platformRevenue: Math.round(platformRev),
        providerPayouts: payouts,
        refunds,
        serviceBreakdown: {
          rentals: rentalVol,
          driverHires: driverVol,
          washes: washVol,
          carpooling: 0,
        },
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveCommissions = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from("platform_settings")
      .update({
        commission_rental_pct: commissions.rental,
        commission_driver_pct: commissions.driver,
        commission_wash_pct: commissions.wash,
        commission_pool_pct: commissions.pooling,
        commission_pct: commissions.rental,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Platform commission rates updated across booking services!");
  };

  if (loading) return <Skeleton className="h-56 w-full mt-4" />;

  return (
    <div className="mt-4 space-y-6">
      {/* Top Revenue Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Gross Booking Volume (GMV)
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">{currency(revenueStats.gmv)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Live booking total</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <IndianRupee className="h-4 w-4 text-brand" /> Net Synchoo Revenue
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(revenueStats.platformRevenue)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">From platform commission</p>
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
          <p className="text-[11px] text-muted-foreground mt-0.5">Total refunded volume</p>
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
                    min="0"
                    max="50"
                    value={commissions.rental}
                    onChange={(e) => setCommissions({ ...commissions, rental: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Driver Hires (Chauffeur)</Label>
                  <p className="text-[11px] text-muted-foreground">Deducted from driver trip pay</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={commissions.driver}
                    onChange={(e) => setCommissions({ ...commissions, driver: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Doorstep Vehicle Washes</Label>
                  <p className="text-[11px] text-muted-foreground">Deducted from washing partner</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={commissions.wash}
                    onChange={(e) => setCommissions({ ...commissions, wash: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Carpooling Split Rides</Label>
                  <p className="text-[11px] text-muted-foreground">Platform coordination fee</p>
                </div>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={commissions.pooling}
                    onChange={(e) => setCommissions({ ...commissions, pooling: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" size="sm" className="w-full text-xs" disabled={saving}>
                  <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Update Commissions"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Vertical Distribution Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-brand" /> Vertical Volume Breakdown
            </CardTitle>
            <CardDescription>Live revenue distribution across mobility verticals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium">Self-Drive Rentals</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.rentals)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-brand"
                  style={{
                    width: `${revenueStats.gmv > 0 ? (revenueStats.serviceBreakdown.rentals / revenueStats.gmv) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium">Chauffeur / Driver Hires</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.driverHires)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{
                    width: `${revenueStats.gmv > 0 ? (revenueStats.serviceBreakdown.driverHires / revenueStats.gmv) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium">Doorstep Vehicle Washes</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.washes)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-cyan-500"
                  style={{
                    width: `${revenueStats.gmv > 0 ? (revenueStats.serviceBreakdown.washes / revenueStats.gmv) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium">Carpooling Seat Split</span>
                <span className="font-semibold">{currency(revenueStats.serviceBreakdown.carpooling)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${revenueStats.gmv > 0 ? (revenueStats.serviceBreakdown.carpooling / revenueStats.gmv) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
