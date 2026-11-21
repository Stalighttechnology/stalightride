import { CityPicker } from "@/components/city-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { useActiveRole } from "@/hooks/use-active-role";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { FormSkeleton, SectionHeaderSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Upload,
  Check,
  Camera,
  Eye,
  Plus,
  CarFront,
  LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: Profile });

function Profile() {
  const { user } = useSession();
  const { isDriver, isHost, isAdmin } = useActiveRole();
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [dlSaving, setDlSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) =>
        setProfile(data ?? { id: user.id, full_name: "", phone: "", city: "", avatar_url: "" }),
      );
  }, [user?.id]);

  const dlUrls = useSignedUrls("verification-docs", [profile?.dl_front_url, profile?.dl_back_url]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await api.from("profiles").upsert({
      id: user.id,
      full_name: profile.full_name,
      phone: profile.phone,
      city: profile.city,
      avatar_url: profile.avatar_url,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile saved");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 4000);
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (e.target) {
      e.target.value = "";
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await api.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const { data, error: sErr } = await api.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr || !data) {
      toast.error(sErr?.message ?? "Could not sign URL");
      setUploading(false);
      return;
    }
    setProfile({ ...profile, avatar_url: data.signedUrl });
    setUploading(false);
  };

  const uploadDl = async (side: "front" | "back", file: File) => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/dl-${side}-${Date.now()}.${ext}`;
    const { error } = await api.storage
      .from("verification-docs")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return path;
  };

  const submitDl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!profile.dl_number || !profile.dl_expiry)
      return toast.error("Enter licence number and expiry");
    if (!profile.dl_front_url || !profile.dl_back_url)
      return toast.error("Upload both front and back images");
    setDlSaving(true);
    const { error } = await api
      .from("profiles")
      .update({
        dl_number: profile.dl_number,
        dl_expiry: profile.dl_expiry,
        dl_front_url: profile.dl_front_url,
        dl_back_url: profile.dl_back_url,
        dl_status: "pending",
        dl_rejection_reason: null,
      } as any)
      .eq("id", user.id);
    setDlSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Submitted — we'll review shortly");
      setProfile({ ...profile, dl_status: "pending" });
    }
  };

  if (!user || !profile)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
          <SectionHeaderSkeleton />
          <FormSkeleton fields={4} />
          <FormSkeleton fields={2} />
        </div>
      </div>
    );

  const initial = (profile.full_name || user.email || "U").charAt(0).toUpperCase();
  const status: string = profile.dl_status ?? "none";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your details and driving licence verification.
          </p>
        </div>

        {isDriver && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                    <CarFront className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-base font-semibold">Hireable Driver Profile</h2>
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] uppercase">
                        Approved &amp; Bookable
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You are an accredited chauffeur on Synchoo. Users can hire you on hourly and daily packages.
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs">
                  <Link to="/driver-dashboard">Open Driver Console</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <form onSubmit={save} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 ring-2 ring-border/80 shadow-xs">
                  <AvatarImage src={profile.avatar_url} />
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:border-primary/50">
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    {uploading ? "Uploading…" : "Change photo"}
                    <input type="file" accept="image/*" className="hidden" onChange={upload} />
                  </label>
                  <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG or WebP</p>
                </div>
              </div>
              <div>
                <Label>Full name</Label>
                <Input
                  value={profile.full_name ?? ""}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={profile.phone ?? ""}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <CityPicker
                    value={profile.city ?? ""}
                    onChange={(c) => setProfile({ ...profile, city: c })}
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user.email ?? ""} disabled />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                {justSaved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <Check className="h-4 w-4" />
                    Profile saved
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold">Driving licence</h2>
                <p className="text-xs text-muted-foreground">
                  Required before you can book any vehicle.
                </p>
              </div>
              <DlBadge status={status} />
            </div>

            {status === "rejected" && profile.dl_rejection_reason && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <p className="font-medium">Rejected</p>
                <p className="text-xs">{profile.dl_rejection_reason}</p>
              </div>
            )}

            <form onSubmit={submitDl} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Licence number</Label>
                  <Input
                    value={profile.dl_number ?? ""}
                    disabled={status === "approved" || status === "pending"}
                    onChange={(e) => setProfile({ ...profile, dl_number: e.target.value })}
                    placeholder="DL-XX-YYYY-NNNNNNN"
                  />
                </div>
                <div>
                  <Label>Expiry date</Label>
                  <DatePicker
                    value={profile.dl_expiry ?? ""}
                    disabled={status === "approved" || status === "pending"}
                    onChange={(d) => setProfile({ ...profile, dl_expiry: d })}
                    minDate={new Date()}
                    placeholder="dd-mm-yyyy"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DlUpload
                  label="Front image"
                  path={profile.dl_front_url}
                  signed={profile.dl_front_url ? dlUrls[profile.dl_front_url] : null}
                  disabled={status === "approved" || status === "pending"}
                  onFile={async (f) => {
                    const p = await uploadDl("front", f);
                    if (p) setProfile({ ...profile, dl_front_url: p });
                  }}
                />
                <DlUpload
                  label="Back image"
                  path={profile.dl_back_url}
                  signed={profile.dl_back_url ? dlUrls[profile.dl_back_url] : null}
                  disabled={status === "approved" || status === "pending"}
                  onFile={async (f) => {
                    const p = await uploadDl("back", f);
                    if (p) setProfile({ ...profile, dl_back_url: p });
                  }}
                />
              </div>

              {(status === "none" || status === "rejected") && (
                <Button type="submit" disabled={dlSaving}>
                  {dlSaving ? "Submitting…" : "Submit for verification"}
                </Button>
              )}
              {status === "pending" && (
                <p className="text-xs text-muted-foreground">
                  Under review. You'll be notified when it's decided.
                </p>
              )}
              {status === "approved" && (
                <p className="text-xs text-emerald-600">Verified. You can book vehicles now.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DlBadge({ status }: { status: string }) {
  if (status === "approved")
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
        <ShieldCheck className="h-3 w-3" />
        Approved
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" />
        Rejected
      </Badge>
    );
  return <Badge variant="outline">Not submitted</Badge>;
}

function DlUpload({
  label,
  path,
  signed,
  onFile,
  disabled,
}: {
  label: string;
  path: string | null;
  signed: string | null | undefined;
  onFile: (f: File) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (disabled) return;
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    inputRef.current?.click();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {path && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" /> Attached
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 15 * 1024 * 1024) {
              toast.error(`"${f.name}" exceeds the 15MB limit.`);
              return;
            }
            onFile(f);
          }
        }}
      />

      {path && signed ? (
        <div className="group relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-md">
          <img src={signed} alt={label} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />

          {/* Quick Action Overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="h-8 gap-1.5 text-xs bg-background/90 text-foreground hover:bg-background shadow-md backdrop-blur-md"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openPicker}
                className="h-8 gap-1.5 text-xs bg-background/90 text-foreground hover:bg-background shadow-md backdrop-blur-md"
              >
                <Camera className="h-3.5 w-3.5" /> Retake
              </Button>
            )}
          </div>

          <div className="absolute top-2 left-2 z-10 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
            {label}
          </div>
        </div>
      ) : path ? (
        <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-border bg-muted/20 text-center">
          <p className="text-xs font-medium text-foreground">File uploaded</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Generating secure preview...</p>
        </div>
      ) : (
        <div
          onClick={openPicker}
          className={`group flex aspect-[16/10] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-4 text-center transition-all duration-200 ${
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:border-primary/60 hover:bg-muted/40 hover:scale-[1.01] active:scale-[0.99] dark:bg-muted/10 dark:hover:bg-muted/25"
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-200 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/20">
            <Camera className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-foreground">Upload {label}</span>
          <span className="text-[10px] text-muted-foreground">Clear photo showing text & photo</span>
        </div>
      )}

      {/* Lightbox Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 bg-card border-border text-card-foreground">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              {label} Preview
            </DialogTitle>
          </DialogHeader>
          {signed && (
            <div className="relative aspect-video max-h-[60vh] w-full overflow-hidden rounded-xl border border-border bg-black/10 dark:bg-black/40">
              <img src={signed} alt={label} className="h-full w-full object-contain" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setModalOpen(false);
                  openPicker();
                }}
                className="gap-1.5 text-xs"
              >
                <Camera className="h-3.5 w-3.5" /> Replace Photo
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="text-xs"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
