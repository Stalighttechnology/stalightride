import { CityPicker } from "@/components/city-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { FormSkeleton, SectionHeaderSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Clock, Upload, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: Profile });

function Profile() {
  const { user } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [dlSaving, setDlSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data ?? { id: user.id, full_name: "", phone: "", city: "", avatar_url: "" }));
  }, [user?.id]);

  const dlUrls = useSignedUrls("verification-docs", [profile?.dl_front_url, profile?.dl_back_url]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
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
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data, error: sErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr || !data) { toast.error(sErr?.message ?? "Could not sign URL"); setUploading(false); return; }
    setProfile({ ...profile, avatar_url: data.signedUrl });
    setUploading(false);
  };

  const uploadDl = async (side: "front" | "back", file: File) => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/dl-${side}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("verification-docs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return null; }
    return path;
  };

  const submitDl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!profile.dl_number || !profile.dl_expiry) return toast.error("Enter licence number and expiry");
    if (!profile.dl_front_url || !profile.dl_back_url) return toast.error("Upload both front and back images");
    setDlSaving(true);
    const { error } = await supabase.from("profiles").update({
      dl_number: profile.dl_number,
      dl_expiry: profile.dl_expiry,
      dl_front_url: profile.dl_front_url,
      dl_back_url: profile.dl_back_url,
      dl_status: "pending",
      dl_rejection_reason: null,
    } as any).eq("id", user.id);
    setDlSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Submitted — we'll review shortly"); setProfile({ ...profile, dl_status: "pending" }); }
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
          <p className="text-sm text-muted-foreground">Manage your details and driving licence verification.</p>
        </div>

        <Card><CardContent className="p-6">
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16"><AvatarImage src={profile.avatar_url} /><AvatarFallback>{initial}</AvatarFallback></Avatar>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                {uploading ? "Uploading…" : "Change photo"}
                <input type="file" accept="image/*" className="hidden" onChange={upload} />
              </label>
            </div>
            <div><Label>Full name</Label><Input value={profile.full_name ?? ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Phone</Label><Input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
              <div><Label>City</Label><CityPicker value={profile.city ?? ""} onChange={(c) => setProfile({ ...profile, city: c })} /></div>
            </div>
            <div><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
              {justSaved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <Check className="h-4 w-4" />Profile saved
                </span>
              )}
            </div>

          </form>
        </CardContent></Card>

        <Card><CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold">Driving licence</h2>
              <p className="text-xs text-muted-foreground">Required before you can book any vehicle.</p>
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
              <div><Label>Licence number</Label><Input value={profile.dl_number ?? ""} disabled={status === "approved" || status === "pending"} onChange={(e) => setProfile({ ...profile, dl_number: e.target.value })} placeholder="DL-XX-YYYY-NNNNNNN" /></div>
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
              <DlUpload label="Front image" path={profile.dl_front_url} signed={profile.dl_front_url ? dlUrls[profile.dl_front_url] : null} disabled={status === "approved" || status === "pending"}
                onFile={async (f) => { const p = await uploadDl("front", f); if (p) setProfile({ ...profile, dl_front_url: p }); }} />
              <DlUpload label="Back image" path={profile.dl_back_url} signed={profile.dl_back_url ? dlUrls[profile.dl_back_url] : null} disabled={status === "approved" || status === "pending"}
                onFile={async (f) => { const p = await uploadDl("back", f); if (p) setProfile({ ...profile, dl_back_url: p }); }} />
            </div>

            {(status === "none" || status === "rejected") && (
              <Button type="submit" disabled={dlSaving}>{dlSaving ? "Submitting…" : "Submit for verification"}</Button>
            )}
            {status === "pending" && <p className="text-xs text-muted-foreground">Under review. You'll be notified when it's decided.</p>}
            {status === "approved" && <p className="text-xs text-emerald-600">Verified. You can book vehicles now.</p>}
          </form>
        </CardContent></Card>
      </div>
    </div>
  );
}

function DlBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700"><ShieldCheck className="h-3 w-3" />Approved</Badge>;
  if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />Rejected</Badge>;
  return <Badge variant="outline">Not submitted</Badge>;
}

function DlUpload({ label, path, signed, onFile, disabled }: { label: string; path: string | null; signed: string | null | undefined; onFile: (f: File) => void | Promise<void>; disabled?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <label className={`mt-1 flex aspect-[16/10] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary/50"}`}>
        {path && signed ? (
          <img src={signed} alt={label} className="h-full w-full object-cover" />
        ) : path ? (
          <span className="text-xs text-muted-foreground">Uploaded</span>
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted-foreground"><Upload className="h-4 w-4" />Choose file</span>
        )}
        <input type="file" accept="image/*" className="hidden" disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
    </div>
  );
}
