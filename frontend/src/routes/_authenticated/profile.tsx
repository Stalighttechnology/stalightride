import { CityPicker } from "@/components/city-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useId } from "react";
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
  CalendarDays,
  Wallet,
  Gift,
  ChevronRight,
  User,
  Mail,
  Phone,
  MapPin,
  Sparkles,
  Building2,
  ExternalLink,
  Loader2,
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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [bookingCount, setBookingCount] = useState<number | null>(null);

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

    // Load e-commerce quick stats (wallet & bookings)
    api
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setWalletBalance(data?.balance ?? 0));

    api
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .then(({ count }) => setBookingCount(count ?? 0));
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
      toast.error(error.message || "Failed to upload document");
      return null;
    }
    toast.success(`${side === "front" ? "Front" : "Back"} photo uploaded successfully`);
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
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
          <SectionHeaderSkeleton />
          <FormSkeleton fields={4} />
          <FormSkeleton fields={2} />
        </div>
      </div>
    );

  const initial = (profile.full_name || user.email || "U").charAt(0).toUpperCase();
  const status: string = profile.dl_status ?? "none";

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        {/* 1. Professional E-Commerce Profile Hero Header */}
        <Card className="overflow-hidden border border-border/80 shadow-sm bg-card">
          <div className="h-28 bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 relative">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white/90 bg-black/25 px-2.5 py-1 rounded-full backdrop-blur-xs">
                Verified Account
              </span>
            </div>
          </div>
          <CardContent className="px-6 pb-6 pt-0 relative">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="relative group shrink-0">
                  <Avatar className="h-24 w-24 ring-4 ring-card shadow-lg bg-card text-2xl font-bold">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback className="bg-gradient-to-tr from-indigo-600 to-blue-500 text-white">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <label
                    className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground shadow-md cursor-pointer hover:bg-primary/90 transition-transform group-hover:scale-105"
                    title="Change profile photo"
                  >
                    <Camera className="h-4 w-4" />
                    <input type="file" accept="image/*" className="hidden" onChange={upload} />
                  </label>
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                      {profile.full_name || "Synchoo Member"}
                    </h1>
                    <DlBadge status={status} />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{user.email}</span>
                    {profile.city && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {profile.city}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Badges / Account Category */}
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && (
                  <Badge className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-semibold">
                    Super Admin
                  </Badge>
                )}
                {isHost && (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                    Verified Host
                  </Badge>
                )}
                {isDriver && (
                  <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-semibold">
                    Chauffeur Driver
                  </Badge>
                )}
              </div>
            </div>

            {/* Quick Action Navigation Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/60">
              <Link
                to="/bookings"
                className="p-3 rounded-xl border border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors flex items-center gap-3 group"
              >
                <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">My Bookings</p>
                  <p className="text-[11px] text-muted-foreground">{bookingCount ?? 0} active/past</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>

              <Link
                to="/wallet"
                className="p-3 rounded-xl border border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors flex items-center gap-3 group"
              >
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">Wallet Balance</p>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    ₹{walletBalance !== null ? Number(walletBalance).toLocaleString("en-IN") : "0"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>

              <Link
                to="/referrals"
                className="p-3 rounded-xl border border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors flex items-center gap-3 group"
              >
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Gift className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">Refer &amp; Earn</p>
                  <p className="text-[11px] text-muted-foreground">Invite friends</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>

              {isAdmin ? (
                <Link
                  to="/admin"
                  className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-100/50 transition-colors flex items-center gap-3 group"
                >
                  <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <LayoutDashboard className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate">Admin Console</p>
                    <p className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80">Command Center</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ) : (
                <Link
                  to="/help"
                  className="p-3 rounded-xl border border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors flex items-center gap-3 group"
                >
                  <div className="h-9 w-9 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">Help &amp; Support</p>
                    <p className="text-[11px] text-muted-foreground">FAQs &amp; safety</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Driver Role Callout Card (If driver) */}
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
                      <Badge className="bg-emerald-600 text-white font-semibold text-[10px] uppercase tracking-wider">
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

        {/* 3. Personal Details Form Card */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-6">
            <div className="mb-4">
              <h2 className="font-display text-lg font-semibold text-foreground">Personal Information</h2>
              <p className="text-xs text-muted-foreground">
                Update your contact details and home city for accurate trip pickups.
              </p>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-medium">Full Name</Label>
                  <Input
                    value={profile.full_name ?? ""}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    placeholder="Enter your full name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Email Address</Label>
                  <Input value={user.email ?? ""} disabled className="mt-1 bg-muted/50 cursor-not-allowed" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-medium">Phone Number</Label>
                  <Input
                    value={profile.phone ?? ""}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Primary City</Label>
                  <div className="mt-1">
                    <CityPicker
                      value={profile.city ?? ""}
                      onChange={(c) => setProfile({ ...profile, city: c })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button type="submit" disabled={saving} className="rounded-xl px-5 text-xs font-semibold">
                  {saving ? "Saving Changes…" : "Save Changes"}
                </Button>
                {justSaved && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 animate-in fade-in">
                    <Check className="h-4 w-4" />
                    Profile changes saved successfully
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 4. Driving Licence Verification Card */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">Driving Licence Verification</h2>
                <p className="text-xs text-muted-foreground">
                  Government-issued motor licence required before taking keys or booking rental rides.
                </p>
              </div>
              <DlBadge status={status} />
            </div>

            {status === "rejected" && profile.dl_rejection_reason && (
              <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-xs text-destructive">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" /> Verification Rejected
                </p>
                <p className="mt-1 text-muted-foreground">{profile.dl_rejection_reason}</p>
              </div>
            )}

            <form onSubmit={submitDl} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-medium">Licence Number</Label>
                  <Input
                    value={profile.dl_number ?? ""}
                    disabled={status === "approved" || status === "pending"}
                    onChange={(e) => setProfile({ ...profile, dl_number: e.target.value })}
                    placeholder="DL-XX-YYYY-NNNNNNN"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Expiry Date</Label>
                  <div className="mt-1">
                    <DatePicker
                      value={profile.dl_expiry ?? ""}
                      disabled={status === "approved" || status === "pending"}
                      onChange={(d) => setProfile({ ...profile, dl_expiry: d })}
                      minDate={new Date()}
                      placeholder="dd-mm-yyyy"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DlUpload
                  label="Licence Front Photo"
                  path={profile.dl_front_url}
                  signed={profile.dl_front_url ? dlUrls[profile.dl_front_url] : null}
                  disabled={status === "approved" || status === "pending"}
                  onFile={async (f) => {
                    const p = await uploadDl("front", f);
                    if (p) setProfile((prev: any) => ({ ...prev, dl_front_url: p }));
                  }}
                />
                <DlUpload
                  label="Licence Back Photo"
                  path={profile.dl_back_url}
                  signed={profile.dl_back_url ? dlUrls[profile.dl_back_url] : null}
                  disabled={status === "approved" || status === "pending"}
                  onFile={async (f) => {
                    const p = await uploadDl("back", f);
                    if (p) setProfile((prev: any) => ({ ...prev, dl_back_url: p }));
                  }}
                />
              </div>

              {(status === "none" || status === "rejected") && (
                <Button type="submit" disabled={dlSaving} className="rounded-xl px-5 text-xs font-semibold">
                  {dlSaving ? "Submitting Documents…" : "Submit for Verification"}
                </Button>
              )}
              {status === "pending" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Under review by our trust &amp; safety compliance team. You'll be notified once verified.
                </p>
              )}
              {status === "approved" && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Driving licence verified. You have full self-drive rental booking access.
                </p>
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
      <Badge
        variant="secondary"
        className="gap-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold px-2.5 py-0.5"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Approved
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold px-2.5 py-0.5"
      >
        <Clock className="h-3.5 w-3.5" />
        Pending Review
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1.5 font-semibold px-2.5 py-0.5">
        <ShieldAlert className="h-3.5 w-3.5" />
        Action Required
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-slate-500 dark:text-slate-400 px-2.5 py-0.5 font-medium">
      Not Submitted
    </Badge>
  );
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
  const [uploading, setUploading] = useState(false);
  const inputId = useId();

  const handleFile = async (file: File) => {
    try {
      setUploading(true);
      await onFile(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-medium text-foreground cursor-pointer">
          {label}
        </label>
        {path && (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check className="h-3 w-3" /> Attached
          </span>
        )}
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFile(file);
          }
          e.target.value = "";
        }}
      />
      <div className="mt-1 flex gap-2">
        <label
          htmlFor={disabled || uploading ? undefined : inputId}
          className={`flex-1 flex items-center justify-start gap-2 h-9 px-3 text-xs rounded-xl border border-dashed transition-colors select-none ${
            disabled || uploading
              ? "opacity-50 cursor-not-allowed bg-muted/30"
              : path
                ? "border-emerald-500/50 bg-emerald-500/5 text-foreground hover:bg-emerald-500/10 cursor-pointer"
                : "border-input bg-background hover:bg-accent hover:border-solid cursor-pointer"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              <span className="truncate">Uploading...</span>
            </>
          ) : path ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span className="truncate font-medium text-emerald-600 dark:text-emerald-400">
                Replace Document
              </span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">Upload Document</span>
            </>
          )}
        </label>
        {path && signed && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="h-9 px-2.5 rounded-xl gap-1 text-xs"
            title="Inspect preview"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md p-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{label}</DialogTitle>
          </DialogHeader>
          {signed && (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              <img src={signed} alt={label} className="w-full h-auto max-h-[70vh] object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
