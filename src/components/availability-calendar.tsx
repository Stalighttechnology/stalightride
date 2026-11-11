import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Ban, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

type Vehicle = { id: string; title: string };
type Range = { id?: string; start_date: string; end_date: string; reason?: string | null; kind: "booked" | "blocked" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthLabel = (d: Date) => d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

/** Host availability calendar: shows booked vs manually blocked days and lets hosts block dates. */
export function AvailabilityCalendar({ vehicles }: { vehicles: Vehicle[] }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [ranges, setRanges] = useState<Range[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!vehicleId) return setRanges([]);
    setRanges(null);
    const [{ data: blocks }, { data: bookings }] = await Promise.all([
      api.from("availability_blocks").select("id,start_date,end_date,reason").eq("vehicle_id", vehicleId),
      api.from("bookings").select("start_date,end_date,status").eq("vehicle_id", vehicleId).in("status", ["pending", "confirmed"]),
    ]);
    setRanges([
      ...(blocks ?? []).map((b: any) => ({ ...b, kind: "blocked" as const })),
      ...(bookings ?? []).map((b: any) => ({ start_date: b.start_date, end_date: b.end_date, kind: "booked" as const })),
    ]);
  };
  useEffect(() => { load(); }, [vehicleId]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = first.getDay();
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let i = 1; i <= total; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));
    return cells;
  }, [month]);

  const stateFor = (d: Date): Range["kind"] | null => {
    const s = iso(d);
    const hit = (ranges ?? []).find((r) => r.start_date <= s && r.end_date >= s);
    return hit?.kind ?? null;
  };

  const addBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !from || !to) return;
    if (to < from) return toast.error("End date must be after the start date.");
    setSaving(true);
    const { error } = await api.from("availability_blocks").insert({
      vehicle_id: vehicleId,
      start_date: from,
      end_date: to,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dates blocked — hidden from Browse rides");
    setFrom(""); setTo(""); setReason("");
    load();
  };

  const removeBlock = async (id: string) => {
    const { error } = await api.from("availability_blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Block removed");
    load();
  };

  const blocks = (ranges ?? []).filter((r) => r.kind === "blocked");

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand" />
            <h3 className="font-display text-lg font-semibold">Availability calendar</h3>
          </div>
          {vehicles.length > 1 && (
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="h-9 max-w-[14rem] rounded-xl border border-input bg-background px-3 text-sm"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium">{monthLabel(month)}</p>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {!ranges ? (
          <Skeleton className="h-56 rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                if (!d) return <div key={i} />;
                const st = stateFor(d);
                return (
                  <div
                    key={i}
                    className={`grid aspect-square place-items-center rounded-lg text-xs ${
                      st === "booked"
                        ? "bg-brand/15 font-semibold text-brand"
                        : st === "blocked"
                          ? "bg-destructive/15 font-semibold text-destructive"
                          : "bg-muted/50 text-foreground"
                    }`}
                    title={st ?? "Available"}
                  >
                    {d.getDate()}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand/60" />Booked</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive/60" />Blocked</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted" />Available</span>
            </div>
          </>
        )}

        <form onSubmit={addBlock} className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Block from</Label>
            <DatePicker
              value={from}
              onChange={setFrom}
              minDate={new Date()}
              placeholder="dd-mm-yyyy"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Until</Label>
            <DatePicker
              value={to}
              onChange={setTo}
              minDate={from || new Date()}
              placeholder="dd-mm-yyyy"
              className="h-10 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Servicing" className="rounded-xl" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={saving || !vehicleId} className="w-full rounded-xl">
              <Ban className="mr-2 h-4 w-4" />{saving ? "Blocking…" : "Block dates"}
            </Button>
          </div>
        </form>

        {blocks.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium">{b.start_date} → {b.end_date}</p>
                  {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Blocked</Badge>
                  <Button variant="ghost" size="icon" className="rounded-full" aria-label="Remove block" onClick={() => removeBlock(b.id!)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
