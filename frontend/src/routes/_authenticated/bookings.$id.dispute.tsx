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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import { ShieldAlert, Eye, Camera } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InspectionPhotoUploader } from "@/components/inspection-photo-uploader";

export const Route = createFileRoute("/_authenticated/bookings/$id/dispute")({
  component: DisputePage,
});

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
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: bk }, { data: d }] = await Promise.all([
      api
        .from("bookings")
        .select("id,customer_id,vendor_id,vehicles(title)")
        .eq("id", id)
        .maybeSingle(),
      api
        .from("disputes")
        .select("*")
        .eq("booking_id", id)
        .order("created_at", { ascending: false }),
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
          <p className="mt-3 text-sm text-muted-foreground">
            You don't have access to this booking.
          </p>
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
              <Textarea
                rows={5}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="What happened and when?"
              />
            </div>
            <InspectionPhotoUploader
              files={files}
              onChange={setFiles}
              maxPhotos={8}
              label="Photos & evidence"
              description="Upload photos supporting your report (damage, scratches, fuel gauge, odometer, or cleanliness)."
              recommendedTags={[
                "Damage & scratches",
                "Fuel gauge indicator",
                "Odometer cluster",
                "Cabin cleanliness",
                "Exterior overview",
              ]}
              tagLabel="Suggested evidence:"
              disabled={saving}
            />
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
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{d.subject}</p>
          <p className="text-xs text-muted-foreground">
            {d.category} · {new Date(d.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={d.status === "resolved" ? "secondary" : "outline"}>{d.status}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-foreground/90">{d.detail}</p>
      {d.photos && d.photos.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" /> Attached evidence photos ({d.photos.length})
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {d.photos.map((p: string, idx: number) => (
              <div
                key={p}
                onClick={() => urls[p] && setLightboxPhoto(urls[p]!)}
                className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-border bg-muted/20 shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
              >
                {urls[p] ? (
                  <>
                    <img src={urls[p]!} alt={`Evidence ${idx + 1}`} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100">
                      <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-md backdrop-blur-md">
                        <Eye className="h-3 w-3" /> View
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                    Loading…
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {d.resolution && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Admin resolution
          </span>
          <p className="mt-1 whitespace-pre-line text-foreground/90">{d.resolution}</p>
        </div>
      )}

      {/* Lightbox Modal */}
      <Dialog open={!!lightboxPhoto} onOpenChange={(open) => !open && setLightboxPhoto(null)}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 bg-card border-border text-card-foreground">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Evidence Photo Preview
            </DialogTitle>
          </DialogHeader>
          {lightboxPhoto && (
            <div className="relative aspect-video max-h-[60vh] w-full overflow-hidden rounded-xl border border-border bg-black/10 dark:bg-black/40">
              <img src={lightboxPhoto} alt="Dispute evidence" className="h-full w-full object-contain" />
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={() => setLightboxPhoto(null)} className="text-xs">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
