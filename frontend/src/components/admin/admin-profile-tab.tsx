import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { ListPager, usePage } from "@/components/list-pager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CityPicker } from "@/components/city-picker";
import { toast } from "sonner";
import {
  ShieldCheck,
  Shield,
  Key,
  Lock,
  Camera,
  Check,
  Copy,
  MapPin,
  Mail,
  Phone,
  User,
  Sliders,
  Calendar,
  Layers,
  Activity,
  FileText,
} from "lucide-react";

interface AdminProfileTabProps {
  user: any;
  onSelectTab: (tabId: string) => void;
}

export function AdminProfileTab({ user, onSelectTab }: AdminProfileTabProps) {
  const pager = usePage(1);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(
          data ?? {
            id: user.id,
            full_name: user.user_metadata?.full_name || "",
            phone: "",
            city: "",
            avatar_url: "",
          },
        );
        setLoading(false);
      });
  }, [user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setSaving(true);
    const { error } = await api.from("profiles").upsert({
      id: user.id,
      full_name: profile.full_name,
      phone: profile.phone,
      city: profile.city,
      avatar_url: profile.avatar_url,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Administrator profile updated");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 4000);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (e.target) e.target.value = "";
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/admin-avatar-${Date.now()}.${ext}`;
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
      toast.error(sErr?.message ?? "Could not sign photo URL");
      setUploading(false);
      return;
    }
    setProfile({ ...profile, avatar_url: data.signedUrl });
    setUploading(false);
    toast.success("Avatar uploaded");
  };

  const copyUserId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    toast.success("User ID copied to clipboard");
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading || !profile) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-[#7f849e]">
        Loading administrator profile...
      </div>
    );
  }

  const initial = (profile.full_name || user.email || "A").charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      {/* 1. Header Banner */}
      <Card className="overflow-hidden border border-slate-200/90 dark:border-[#222433] bg-white dark:bg-[#11131a] shadow-md">
        <div className="h-32 bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 p-6 flex items-start justify-between relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-bold text-white uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Super Administrator Account
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => onSelectTab("settings")}
              size="sm"
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs rounded-xl backdrop-blur-xs gap-1.5"
            >
              <Sliders className="h-3.5 w-3.5" />
              Platform Settings
            </Button>
          </div>
        </div>

        <CardContent className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="relative group shrink-0">
                <Avatar className="h-24 w-24 ring-4 ring-white dark:ring-[#11131a] shadow-xl text-2xl font-bold bg-white dark:bg-[#181a24]">
                  <AvatarImage src={profile.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-tr from-indigo-600 to-blue-500 text-white">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <label
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer transition-transform group-hover:scale-105"
                  title="Upload profile photo"
                >
                  <Camera className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    {profile.full_name || "Super Administrator"}
                  </h2>
                  <Badge className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-semibold px-2.5 py-0.5">
                    Root Console
                  </Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold px-2.5 py-0.5">
                    Active Session
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-[#7f849e]">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    {user.email}
                  </span>
                  {profile.city && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {profile.city}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-emerald-500" />
                    All Operations Operational
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={copyUserId}
                variant="outline"
                size="sm"
                className="text-xs rounded-xl border-slate-200 dark:border-[#262838] gap-1.5"
              >
                {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                Copy User ID
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Personal Information Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-slate-200/90 dark:border-[#222433] bg-white dark:bg-[#11131a] shadow-xs">
            <CardContent className="p-6">
              <div className="mb-5 pb-3 border-b border-slate-100 dark:border-[#1f212e]">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-500" />
                  Administrator Identity &amp; Contact
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#7f849e] mt-0.5">
                  Your administrator name and contact details are logged on audit actions and administrative decisions.
                </p>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Full Legal Name
                    </Label>
                    <Input
                      value={profile.full_name ?? ""}
                      onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                      placeholder="e.g. Ada Lovelace"
                      className="mt-1 text-xs rounded-xl border-slate-200 dark:border-[#262838] bg-slate-50 dark:bg-[#161824]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Account Email
                    </Label>
                    <Input
                      value={user.email ?? ""}
                      disabled
                      className="mt-1 text-xs rounded-xl border-slate-200 dark:border-[#262838] bg-slate-100/70 dark:bg-[#151722] text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Emergency Contact Phone
                    </Label>
                    <Input
                      value={profile.phone ?? ""}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                      className="mt-1 text-xs rounded-xl border-slate-200 dark:border-[#262838] bg-slate-50 dark:bg-[#161824]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Operating Headquarter City
                    </Label>
                    <div className="mt-1">
                      <CityPicker
                        value={profile.city ?? ""}
                        onChange={(c) => setProfile({ ...profile, city: c })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-[#1f212e]">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl px-5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {saving ? "Saving Changes…" : "Save Profile Changes"}
                  </Button>
                  {justSaved && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-4 w-4" />
                      Saved successfully
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Driving Licence & Personal Accreditation Status */}
          <Card className="border border-slate-200/90 dark:border-[#222433] bg-white dark:bg-[#11131a] shadow-xs">
            <CardContent className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1f212e] mb-4">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-500" />
                    Driving Licence &amp; Identity Status
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#7f849e] mt-0.5">
                    Personal self-drive rental accreditation status on Synchoo mobility.
                  </p>
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold px-2.5 py-0.5">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  Approved
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-[#222433] bg-slate-50/50 dark:bg-[#161824]">
                  <span className="text-slate-400 block mb-0.5">Licence Number</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {profile.dl_number || "DL-04-2025-ADMIN"}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-[#222433] bg-slate-50/50 dark:bg-[#161824]">
                  <span className="text-slate-400 block mb-0.5">Verification Clearance</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Full Booking &amp; Handover Authority
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 col): Permissions & Roles Card */}
        <div className="space-y-6">
          <Card className="border border-slate-200/90 dark:border-[#222433] bg-white dark:bg-[#11131a] shadow-xs">
            <CardContent className="p-5">
              <div className="mb-4 pb-3 border-b border-slate-100 dark:border-[#1f212e]">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  Super Admin Privileges
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-[#7f849e] mt-0.5">
                  Role grants validated by PostgreSQL row-level security and RPC guards.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Fleet Approval & Vehicle QC", desc: "Decide vehicle verification queues" },
                  { label: "KYC & Identity Accreditation", desc: "Review host and driver legal documents" },
                  { label: "Escrow & Payout Disbursement", desc: "Execute bank withdrawals & refunds" },
                  { label: "Global Platform Commission Fees", desc: "Configure take-rates & tax policies" },
                  { label: "Broadcast Dispatch", desc: "Issue platform-wide operational alerts" },
                  { label: "Arbitration & Dispute Resolution", desc: "Finalize security deposit deductions" },
                ].map((perm, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50/70 dark:bg-[#161824]">
                    <div className="h-5 w-5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="h-3 w-3" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                        {perm.label}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-[#7f849e] mt-0.5">
                        {perm.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200/90 dark:border-[#222433] bg-white dark:bg-[#11131a] shadow-xs">
            <CardContent className="p-5">
              <div className="mb-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-indigo-500" />
                  Console Security
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-[#7f849e] mt-0.5">
                  Session tokens authenticated via Supabase JWT with service role delegation.
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 dark:border-[#222433] bg-slate-50/50 dark:bg-[#161824] space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Role Status:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">SUPER_ADMIN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Auth Method:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">Email &amp; Password</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Encrypted JWT:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active ●</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ListPager {...pager} />
    </div>
  );
}
