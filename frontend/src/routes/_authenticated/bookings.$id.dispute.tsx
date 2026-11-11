import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import { Upload, X, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bookings/$id/dispute")({ component: DisputePage });

function DisputePage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [b, setB] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[] | null>(null);
  const [category, setCategory] = useState("damage");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: bk }, { data: d }] = await Promise.all([
      api.from("bookings").select("id,customer_id,vendor_id,vehicles(title)").eq("id", id).maybeSingle(),
      api.from("disputes").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    ]);
    setB(bk);
    setDisputes(d ?? []);
  };
  useEffect(() => {
    load();
  }, [id]);

  const role = useMemo(() => {
    if (!user || !b) return null;
    if (user.id === b.customer_id) return "customer" as const;
    if (user.id === b.vendor_id) return "vendor" as const;
    return null;
  }, [user, b]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).slice(0, 8);
    setFiles(list);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!user || !b) return;
    if (!subject.trim()) return toast.error("Add a short subject");
    if (!detail.trim()) return toast.error("Describe what happened");
    setSaving(true);
    try {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${b.id}/dispute/${Date.now()}-${i}.${ext}`;
        const { error } = await api.storage.from("trip-photos").upload(path, f, { upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      const { error } = await api.from("disputes").insert({
        booking_id: b.id,
        raised_by: user.id,
        category,
        subject: subject.trim().slice(0, 120),
        detail: detail.trim().slice(0, 2000),
        photos: paths,
        status: "open",
      } as any);
      if (error) throw error;
      toast.success("Dispute filed — admins will review it");
      setSubject("");
      setDetail("");
      setFiles([]);
      setPreviews([]);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not file dispute");
    } finally {
      setSaving(false);
    }
  };

  if (b === null)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-3xl p-6">
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  if (!b || !role)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">You don't have access to this booking.</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs text-muted-foreground">Booking · {b.vehicles?.title}</p>
        <h1 className="font-display text-3xl font-semibold">Report an issue</h1>
        <p className="text-sm text-muted-foreground">
          Damage, fuel shortfall, cleanliness, or anything else that needs an admin review.
        </p>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="fuel">Fuel shortfall</SelectItem>
                    <SelectItem value="cleanliness">Cleanliness</SelectItem>
                    <SelectItem value="late">Late return / no-show</SelectItem>
                    <SelectItem value="payment">Payment / deposit</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject</Label>
                <Input
                  className="mt-1"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Scratch on rear bumper"
                />
              </div>
            </div>
            <div>
              <Label>Details</Label>
              <Textarea rows={5} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What happened and when?" />
            </div>
            <div>
              <Label>Photos / evidence</Label>
              <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center hover:border-primary/50">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs">Add up to 8 photos</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={pick} />
              </label>
              {previews.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {previews.map((src, i) => (
                    <div key={i} className="relative aspect-square overflow-hidden rounded-lg">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setFiles(files.filter((_, x) => x !== i));
                          setPreviews(previews.filter((_, x) => x !== i));
                        }}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate({ to: "/bookings" })}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Filing…" : "File dispute"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <h2 className="mt-8 font-display text-lg font-semibold">Previous reports</h2>
        {!disputes && <Skeleton className="mt-2 h-24" />}
        {disputes && disputes.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No disputes filed for this booking.</p>
        )}
        {disputes && disputes.length > 0 && (
          <ul className="mt-3 space-y-3">
            {disputes.map((d) => (
              <DisputeItem key={d.id} d={d} />
            ))}
          </ul>
        )}

        <div className="mt-6">
          <Link to="/bookings" className="text-sm text-muted-foreground hover:underline">
            ← Back to bookings
          </Link>
        </div>
      </div>
    </div>
  );
}

function DisputeItem({ d }: { d: any }) {
  const urls = useSignedUrls("trip-photos", d.photos ?? []);
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{d.subject}</p>
          <p className="text-xs text-muted-foreground">
            {d.category} · {new Date(d.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={d.status === "resolved" ? "secondary" : "outline"}>{d.status}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{d.detail}</p>
      {d.photos && d.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {d.photos.map((p: string) => (
            <a key={p} href={urls[p] ?? "#"} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border">
              {urls[p] && <img src={urls[p]!} alt="" className="h-full w-full object-cover" />}
            </a>
          ))}
        </div>
      )}
      {d.resolution && (
        <div className="mt-3 rounded-md bg-muted p-3 text-sm">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Admin resolution</span>
          <p className="mt-1 whitespace-pre-line">{d.resolution}</p>
        </div>
      )}
    </li>
  );
}
