/**
 * Admin money tabs: payouts (withdrawal queue), coupons, platform fee
 * settings and promo credits. Same pattern as the queues in
 * src/routes/_authenticated/admin.tsx: local load(), direct queries / RPCs,
 * toast, reload.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { DatePicker } from "@/components/ui/date-picker";

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */
export function WithdrawalQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<"requested" | "paid" | "rejected">("requested");

  const load = async () => {
    setItems(null);
    const { data, error } = await api
      .from("withdrawals")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: filter === "requested" })
      .limit(200);
    if (error) toast.error(error.message);
    setItems(data ?? []);
  };
  useEffect(() => {
    load();
  }, [filter]);

  const decide = async (id: string, decision: "paid" | "rejected") => {
    const reference =
      decision === "paid" ? window.prompt("Payment reference (UTR / transaction ID)") : null;
    if (decision === "paid" && !reference?.trim()) {
      if (reference !== null) toast.error("Enter the payment reference (UTR)"); // null: the admin cancelled
      return;
    }
    const note =
      decision === "rejected"
        ? (window.prompt("Reason shown to the provider (optional)") ?? undefined)
        : undefined;
    const { error } = await api.rpc("admin_decide_withdrawal", {
      _withdrawal_id: id,
      _decision: decision,
      _reference: reference?.trim() || undefined,
      _note: note || undefined,
    });
    if (error) return toast.error(error.message);
    toast.success(decision === "paid" ? "Marked as paid" : "Rejected — amount returned to wallet");
    load();
  };

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {(["requested", "paid", "rejected"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>
      {!items ? (
        <Skeleton className="mt-4 h-40" />
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No {filter} withdrawals.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((w) => {
            const dest =
              w.method === "upi" ? w.upi_id : `${w.account_name} · ${w.account_number} · ${w.ifsc}`;
            return (
              <Card key={w.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-display text-lg font-semibold">
                          {currency(Number(w.amount))}
                        </p>
                        <Badge variant="outline" className="uppercase">
                          {w.method}
                        </Badge>
                        <Badge
                          variant={
                            w.status === "paid"
                              ? "secondary"
                              : w.status === "rejected"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {w.status}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        className="mt-1 break-all text-left text-sm hover:underline"
                        onClick={() => copy(dest)}
                        title="Copy payout details"
                      >
                        {dest}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        User {String(w.user_id).slice(0, 8)} ·{" "}
                        {new Date(w.created_at).toLocaleString()}
                        {w.reference ? ` · Ref ${w.reference}` : ""}
                        {w.admin_note ? ` · ${w.admin_note}` : ""}
                      </p>
                    </div>
                    {w.status === "requested" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => decide(w.id, "paid")}>
                          Mark paid
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide(w.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */
export function CouponManager() {
  const [items, setItems] = useState<any[] | null>(null);
  const [form, setForm] = useState({
    code: "",
    kind: "percent" as "percent" | "amount",
    value: "",
    starts_at: "",
    ends_at: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await api
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const code = form.code.trim().toUpperCase();
    const value = Number(form.value);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast.error("Code: 3–30 letters, numbers, - or _");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a discount value");
    if (form.kind === "percent" && value > 100) return toast.error("Percent off can't exceed 100");
    setSaving(true);
    const { error } = await api.from("coupons").insert({
      code,
      percent_off: form.kind === "percent" ? value : null,
      amount_off: form.kind === "amount" ? value : null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      active: true,
    });
    setSaving(false);
    if (error)
      return toast.error(
        error.message.includes("duplicate") ? "That code already exists" : error.message,
      );
    toast.success(`Coupon ${code} created`);
    setForm({ code: "", kind: form.kind, value: "", starts_at: "", ends_at: "" });
    load();
  };

  const toggle = async (c: any) => {
    const { error } = await api.from("coupons").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-6 sm:items-end">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="cp-code">Code</Label>
            <Input
              id="cp-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="WELCOME20"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-kind">Type</Label>
            <select
              id="cp-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as any })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="percent">% off</option>
              <option value="amount">₹ off</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-value">Value</Label>
            <Input
              id="cp-value"
              type="number"
              min={1}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <Label htmlFor="cp-end">Ends (optional)</Label>
            <DatePicker
              id="cp-end"
              value={form.ends_at}
              onChange={(d) => setForm({ ...form, ends_at: d })}
              minDate={new Date()}
              placeholder="dd-mm-yyyy"
              className="h-9"
            />
          </div>
          <Button onClick={create} disabled={saving}>
            {saving ? "Saving…" : "Create"}
          </Button>
        </CardContent>
      </Card>

      {!items ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coupons yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-mono font-semibold">{c.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.percent_off != null
                      ? `${c.percent_off}% off`
                      : `${currency(Number(c.amount_off ?? 0))} off`}
                    {c.ends_at
                      ? ` · until ${new Date(c.ends_at).toLocaleDateString()}`
                      : " · no expiry"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.active ? "secondary" : "outline"}>
                    {c.active ? "active" : "paused"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => toggle(c)}>
                    {c.active ? "Pause" : "Activate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Platform fees                                                       */
/* ------------------------------------------------------------------ */
const SETTING_FIELDS = [
  { key: "commission_pct", label: "Commission on provider earnings (%)", max: 100 },
  { key: "service_fee_pct", label: "Service fee charged to customers (%)", max: 100 },
  { key: "gst_pct", label: "GST on platform fees (%)", max: 100 },
  { key: "min_withdrawal", label: "Minimum withdrawal (₹)", max: 1_000_000 },
] as const;

export function PlatformSettingsForm() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setValues(
          Object.fromEntries(
            SETTING_FIELDS.map((f) => [f.key, String((data as any)?.[f.key] ?? "")]),
          ),
        );
      });
  }, []);

  const save = async () => {
    if (!values) return;
    const patch: Partial<Record<(typeof SETTING_FIELDS)[number]["key"], number>> = {};
    for (const f of SETTING_FIELDS) {
      const n = Number(values[f.key]);
      if (!Number.isFinite(n) || n < 0 || n > f.max)
        return toast.error(`${f.label}: enter 0–${f.max}`);
      patch[f.key] = n;
    }
    setSaving(true);
    const { error } = await api.from("platform_settings").update(patch).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved — they apply to new bookings");
  };

  if (!values) return <Skeleton className="mt-4 h-40" />;
  return (
    <Card className="mt-4 max-w-xl">
      <CardContent className="grid gap-3 p-4">
        {SETTING_FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`ps-${f.key}`}>{f.label}</Label>
            <Input
              id={`ps-${f.key}`}
              type="number"
              min={0}
              max={f.max}
              step="0.01"
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Changes affect bookings created from now on. Existing bookings keep the fees they were
          priced with.
        </p>
        <Button onClick={save} disabled={saving} className="w-fit">
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Promo credit                                                        */
/* ------------------------------------------------------------------ */
export function GrantCreditForm() {
  const [form, setForm] = useState({ email: "", amount: "", note: "" });
  const [saving, setSaving] = useState(false);

  const grant = async () => {
    const amount = Number(form.amount);
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return toast.error("Enter the user's email");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000)
      return toast.error("Amount must be between 1 and 100000");
    if (!window.confirm(`Credit ${currency(amount)} to ${form.email.trim()}?`)) return;
    setSaving(true);
    const { error } = await api.rpc("admin_grant_credit", {
      _email: form.email.trim(),
      _amount: amount,
      _note: form.note.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Promo credit added");
    setForm({ email: "", amount: "", note: "" });
  };

  return (
    <Card className="mt-4 max-w-xl">
      <CardContent className="grid gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Promo credit can be spent on bookings but is never withdrawable.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="gc-email">User email</Label>
          <Input
            id="gc-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gc-amount">Amount (₹)</Label>
          <Input
            id="gc-amount"
            type="number"
            min={1}
            max={100000}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gc-note">Note shown in their wallet (optional)</Label>
          <Input
            id="gc-note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Sorry for the delay — here's ₹200"
          />
        </div>
        <Button onClick={grant} disabled={saving} className="w-fit">
          {saving ? "Crediting…" : "Grant credit"}
        </Button>
      </CardContent>
    </Card>
  );
}
