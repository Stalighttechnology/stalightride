import { recommendPrice } from "@/lib/price-guide";
import { CityPicker } from "@/components/city-picker";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPicker } from "@/components/map-picker";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendor/vehicles/new")({
  component: NewVehicle,
});

function NewVehicle() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [docs, setDocs] = useState<{
    rc?: File;
    insurance?: File;
    pollution?: File;
    fitness?: File;
  }>({});

  const [form, setForm] = useState({
    title: "",
    category: "car",
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    fuel: "petrol",
    transmission: "manual",
    mileage_kmpl: "",
    seats: "",
    city: "",
    address: "",
    description: "",
    price_hourly: "",
    price_daily: "",
    price_weekly: "",
    security_deposit: "0",
  });
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });

  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).slice(0, 8);
    setFiles(list);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  };
  const remove = (i: number) => {
    setFiles(files.filter((_, x) => x !== i));
    setPreviews(previews.filter((_, x) => x !== i));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.price_daily) return toast.error("Daily price is required");
    if (!pin.lat || !pin.lng)
      return toast.error("Drop a pickup pin on the map so renters can find your vehicle");
    if (!docs.rc || !docs.insurance || !docs.pollution)
      return toast.error("Upload RC, insurance and pollution certificate");
    setSaving(true);
    try {
      await api.from("vendors").upsert({
        id: user.id,
        business_name: user.user_metadata?.full_name || user.email || "Host",
      });
      await api
        .from("user_roles")
        .upsert({ user_id: user.id, role: "vendor" as const }, { onConflict: "user_id,role" });

      const uploadDoc = async (kind: string, file: File) => {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/vehicles/${kind}-${Date.now()}.${ext}`;
        const { error } = await api.storage
          .from("verification-docs")
          .upload(path, file, { upsert: false });
        if (error) throw error;
        return path;
      };
      const rc_url = await uploadDoc("rc", docs.rc);
      const insurance_url = await uploadDoc("insurance", docs.insurance);
      const pollution_url = await uploadDoc("pollution", docs.pollution);
      const fitness_url = docs.fitness ? await uploadDoc("fitness", docs.fitness) : null;

      const insertPayload = {
        vendor_id: user.id,
        title: form.title,
        category: form.category as any,
        brand: form.brand,
        model: form.model,
        year: Number(form.year),
        fuel: form.fuel as any,
        transmission: form.transmission as any,
        mileage_kmpl: form.mileage_kmpl ? Number(form.mileage_kmpl) : null,
        seats: form.seats ? Number(form.seats) : null,
        city: form.city,
        address: form.address || null,
        lat: pin.lat,
        lng: pin.lng,
        description: form.description || null,
        price_hourly: form.price_hourly ? Number(form.price_hourly) : null,
        price_daily: Number(form.price_daily),
        price_weekly: form.price_weekly ? Number(form.price_weekly) : null,
        security_deposit: Number(form.security_deposit || 0),
        status: "draft" as const,
        rc_url,
        insurance_url,
        pollution_url,
        fitness_url,
        verification_status: "pending",
      };

      const { data: vehicle, error } = await api
        .from("vehicles")
        .insert(insertPayload as any)
        .select("id")
        .single();
      if (error) throw error;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${vehicle.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await api.storage
          .from("vehicle-images")
          .upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        await api
          .from("vehicle_images")
          .insert({ vehicle_id: vehicle.id, url: path, sort_order: i });
      }

      toast.success("Submitted for review — you'll be notified once approved.");
      navigate({ to: "/vendor" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 animate-fade-in">
        <h1 className="font-display text-3xl font-semibold">List your vehicle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add photos, pickup location, and pricing so riders can book you.
        </p>

        <Card className="mt-6">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-6">
              <Section title="Basics">
                <Field label="Title">
                  <Input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    required
                    placeholder="e.g. Honda City 2023 — automatic"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category">
                    <Select value={form.category} onValueChange={(v) => set("category", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="car">Car</SelectItem>
                        <SelectItem value="ev">EV</SelectItem>
                        <SelectItem value="motorcycle">Motorcycle</SelectItem>
                        <SelectItem value="scooter">Scooter</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Year">
                    <Input
                      type="number"
                      value={form.year}
                      onChange={(e) => set("year", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Brand">
                    <Input
                      value={form.brand}
                      onChange={(e) => set("brand", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={form.model}
                      onChange={(e) => set("model", e.target.value)}
                      required
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Specs">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fuel">
                    <Select value={form.fuel} onValueChange={(v) => set("fuel", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="petrol">Petrol</SelectItem>
                        <SelectItem value="diesel">Diesel</SelectItem>
                        <SelectItem value="electric">Electric</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="none">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Transmission">
                    <Select value={form.transmission} onValueChange={(v) => set("transmission", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="automatic">Automatic</SelectItem>
                        <SelectItem value="none">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Mileage (kmpl)">
                    <Input
                      type="number"
                      step="0.1"
                      value={form.mileage_kmpl}
                      onChange={(e) => set("mileage_kmpl", e.target.value)}
                    />
                  </Field>
                  <Field label="Seats">
                    <Input
                      type="number"
                      value={form.seats}
                      onChange={(e) => set("seats", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Pickup location">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="City">
                    <CityPicker value={form.city} onChange={(c) => set("city", c)} />
                  </Field>
                </div>
                <div className="mt-2">
                  <Label>Full address</Label>
                  <div className="mt-1">
                    <MapPicker
                      value={pin}
                      address={form.address}
                      onAddressChange={(v) => set("address", v)}
                      onChange={(v) => {
                        setPin({ lat: v.lat, lng: v.lng });
                        if (v.address) set("address", v.address);
                      }}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Pricing (INR)">
                {form.brand.trim() &&
                  form.model.trim() &&
                  form.city &&
                  Number(form.year) > 1980 &&
                  (() => {
                    const r = recommendPrice({
                      ...form,
                      year: Number(form.year),
                      seats: form.seats ? Number(form.seats) : null,
                    });
                    return (
                      <div className="mb-4 rounded-2xl border border-brand/30 bg-brand/5 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                              Recommended price
                            </p>
                            <p className="mt-1 font-display text-2xl font-semibold">
                              ₹{r.daily.toLocaleString("en-IN")}
                              <span className="text-sm font-normal text-muted-foreground">
                                {" "}
                                / day
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Typical range ₹{r.dailyLow.toLocaleString("en-IN")}–₹
                              {r.dailyHigh.toLocaleString("en-IN")} · ₹{r.hourly}/hr · ₹
                              {r.weekly.toLocaleString("en-IN")}/week
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Based on similar {form.brand} {form.model} rentals in {form.city} on
                              other rental sites.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                price_daily: String(r.daily),
                                price_hourly: String(r.hourly),
                                price_weekly: String(r.weekly),
                                security_deposit: String(r.deposit),
                              }))
                            }
                          >
                            Use these prices
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Hourly">
                    <Input
                      type="number"
                      step="1"
                      value={form.price_hourly}
                      onChange={(e) => set("price_hourly", e.target.value)}
                    />
                  </Field>
                  <Field label="Daily *">
                    <Input
                      type="number"
                      step="1"
                      value={form.price_daily}
                      onChange={(e) => set("price_daily", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Weekly">
                    <Input
                      type="number"
                      step="1"
                      value={form.price_weekly}
                      onChange={(e) => set("price_weekly", e.target.value)}
                    />
                  </Field>
                  <Field label="Security deposit">
                    <Input
                      type="number"
                      step="1"
                      value={form.security_deposit}
                      onChange={(e) => set("security_deposit", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Description">
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Highlights, quirks, rules, included extras…"
                />
              </Section>

              <Section title="Photos">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm">Click to upload up to 8 photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onPick}
                  />
                </label>
                {previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {previews.map((src, i) => (
                      <div
                        key={i}
                        className="relative aspect-square overflow-hidden rounded-lg animate-scale-in"
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Verification documents">
                <p className="text-xs text-muted-foreground">
                  Your listing goes live after we verify these. Photos are private.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DocPick
                    label="RC (required)"
                    file={docs.rc}
                    onChange={(f) => setDocs({ ...docs, rc: f })}
                  />
                  <DocPick
                    label="Insurance (required)"
                    file={docs.insurance}
                    onChange={(f) => setDocs({ ...docs, insurance: f })}
                  />
                  <DocPick
                    label="Pollution certificate (required)"
                    file={docs.pollution}
                    onChange={(f) => setDocs({ ...docs, pollution: f })}
                  />
                  <DocPick
                    label="Fitness certificate (optional)"
                    file={docs.fitness}
                    onChange={(f) => setDocs({ ...docs, fitness: f })}
                  />
                </div>
              </Section>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate({ to: "/vendor" })}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Submitting…" : "Submit for review"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function DocPick({
  label,
  file,
  onChange,
}: {
  label: string;
  file?: File;
  onChange: (f: File) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <label className="mt-1 flex cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
        <span className="truncate">{file?.name ?? "Choose PDF or image"}</span>
        <Upload className="h-4 w-4 text-muted-foreground" />
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(f);
          }}
        />
      </label>
    </div>
  );
}
