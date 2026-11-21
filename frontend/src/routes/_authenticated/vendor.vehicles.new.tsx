import { recommendPrice } from "@/lib/price-guide";
import { CityPicker } from "@/components/city-picker";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, X, FileText, CheckCircle2, Trash2, Eye, FileCheck } from "lucide-react";
import { InspectionPhotoUploader } from "@/components/inspection-photo-uploader";

export const Route = createFileRoute("/_authenticated/vendor/vehicles/new")({
  component: NewVehicle,
});

function NewVehicle() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
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
    instant_book: false,
  });
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });

  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

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
        instant_book: Boolean(form.instant_book),
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

              <Section title="Booking options">
                <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/20">
                  <div className="space-y-0.5 pr-4">
                    <Label htmlFor="instant-book" className="text-sm font-medium cursor-pointer">Instant Book</Label>
                    <p className="text-xs text-muted-foreground">
                      Guests are confirmed immediately; you can't decline.
                    </p>
                  </div>
                  <Switch
                    id="instant-book"
                    checked={form.instant_book}
                    onCheckedChange={(checked) => set("instant_book", checked)}
                  />
                </div>
              </Section>

              <Section title="Photos">
                <InspectionPhotoUploader
                  files={files}
                  onChange={setFiles}
                  maxPhotos={12}
                  label="Vehicle photos"
                  description="Upload clear photos of all sides, interior, and dashboard. You can select multiple at once and add more photos anytime."
                  recommendedTags={[
                    "Front view & bumper",
                    "Rear & number plate",
                    "Driver & passenger sides",
                    "Dashboard & odometer",
                    "Interior seats",
                    "Boot space",
                  ]}
                  tagLabel="Suggested angles:"
                  disabled={saving}
                />
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
  onChange: (f?: File) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  const openPicker = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    inputRef.current?.click();
  };

  const isImage = file && file.type.startsWith("image/");
  const isPdf = file && (file.type === "application/pdf" || file.name.endsWith(".pdf"));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {file && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Selected
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 15 * 1024 * 1024) {
              toast.error(`"${f.name}" exceeds the 15MB limit.`);
              return;
            }
            onChange(f);
          }
        }}
      />

      {file ? (
        <div className="group relative flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-all hover:border-primary/50 dark:bg-card">
          <div className="flex items-center gap-3 overflow-hidden">
            {isImage && preview ? (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
                <img src={preview} alt={file.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary dark:bg-primary/20">
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(2)} MB • {isPdf ? "PDF Document" : "Image"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPicker}
              className="h-7 px-2 text-xs"
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(undefined)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="Remove document"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={openPicker}
          className="group flex cursor-pointer items-center justify-between gap-2 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 px-3.5 py-3 transition-all duration-200 hover:border-primary/60 hover:bg-muted/40 dark:bg-muted/10 dark:hover:bg-muted/25"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/20">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Click to upload document</p>
              <p className="text-[10px] text-muted-foreground">Image (JPG, PNG) or PDF up to 15MB</p>
            </div>
          </div>
          <span className="rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
            Browse
          </span>
        </div>
      )}
    </div>
  );
}
