import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Download, ShieldCheck, Trash2 } from "lucide-react";

export const Route = createFileRoute("/data-deletion")({
  component: DataDeletion,
  head: () => ({
    meta: [
      { title: "Privacy & data controls — Synchoo" },
      {
        name: "description",
        content:
          "Export a copy of your Synchoo data or permanently delete your account and personal information. See exactly what is removed and what is retained.",
      },
      { property: "og:title", content: "Privacy & data controls — Synchoo" },
      {
        property: "og:description",
        content:
          "Export your data or request permanent deletion of your Synchoo account and personal information.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const REMOVED = [
  "Your name, profile photo, phone number and city",
  "Your driving licence number, expiry and licence images",
  "Host business details, payout email and identity documents",
  "Driver profile details, photo and documents",
  "Saved vehicles and in-app notifications",
];

const RETAINED = [
  "Completed booking, invoice and payment records (anonymised) — required for tax and accounting",
  "Wallet ledger entries backing those payments and refunds",
  "Ratings text already published, shown without your name",
  "Records tied to an open dispute, until it is resolved",
];

function DataDeletion() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [ack, setAck] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const exportData = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const [profile, bookings, hires, washes, txns, reviews] = await Promise.all([
        api.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        api.from("bookings").select("*").eq("customer_id", user.id),
        api.from("driver_bookings").select("*").eq("customer_id", user.id),
        api.from("wash_bookings").select("*").eq("customer_id", user.id),
        api.from("wallet_transactions").select("*").eq("user_id", user.id),
        api.from("reviews").select("*").eq("customer_id", user.id),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at },
        profile: profile.data ?? null,
        rentals: bookings.data ?? [],
        driver_hires: hires.data ?? [],
        wash_bookings: washes.data ?? [],
        wallet_transactions: txns.data ?? [],
        reviews: reviews.data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synchoo-data-${user.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data export has been downloaded");
    } catch {
      toast.error("Could not build your export. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!user || !ack || confirm.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    try {
      const { data, error } = await api.rpc("delete_my_account_data");
      if (error) throw error;
      const res = (data ?? {}) as { ok?: boolean; reason?: string; count?: number };
      if (!res.ok) {
        if (res.reason === "open_bookings") {
          toast.error(
            `You still have ${res.count ?? 1} active booking(s). Complete or cancel them first.`,
          );
        } else {
          toast.error("We could not process the deletion. Please sign in again and retry.");
        }
        return;
      }
      setDone(true);
      await api.auth.signOut();
    } catch {
      toast.error("Deletion failed. Please try again or contact support.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Privacy</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy & data controls
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Download a copy of your personal data, or permanently delete your account. Deletion is
          irreversible and needs you to be signed in — nobody else can request it for you.
        </p>

        {done ? (
          <Card className="glass mt-8 border-emerald/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-emerald" /> Your data has been deleted
              </CardTitle>
              <CardDescription>
                Your personal details, documents, saved vehicles and notifications are removed, your
                listings are paused and you have been signed out. Anonymised transaction records are
                kept as described in our Privacy Policy.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link to="/">Back to home</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/privacy">Read the Privacy Policy</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-5">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trash2 className="h-4 w-4 text-ember" /> What gets deleted
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Removed or anonymised
                  </p>
                  <ul className="mt-2 ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">
                    {REMOVED.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Retained by law
                  </p>
                  <ul className="mt-2 ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">
                    {RETAINED.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {loading ? null : !user ? (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-cyan" /> Sign in to continue
                  </CardTitle>
                  <CardDescription>
                    For your safety, exports and deletions can only be requested from the signed-in
                    account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="btn-gradient">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Download className="h-4 w-4 text-cyan" /> Export my data
                    </CardTitle>
                    <CardDescription>
                      Downloads a JSON file with your profile, bookings, wallet transactions and
                      reviews.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" onClick={exportData} disabled={busy}>
                      {busy ? "Preparing…" : "Download my data"}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="glass border-destructive/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-destructive" /> Delete my account and
                      data
                    </CardTitle>
                    <CardDescription>
                      Signed in as {user.email}. Active bookings must be completed or cancelled
                      first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="ack"
                        checked={ack}
                        onCheckedChange={(v) => setAck(v === true)}
                      />
                      <Label
                        htmlFor="ack"
                        className="text-sm font-normal leading-relaxed text-muted-foreground"
                      >
                        I understand this is permanent, that my personal data and documents will be
                        removed, and that anonymised transaction records are retained for legal
                        reasons.
                      </Label>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="confirm">Type DELETE to confirm</Label>
                      <Input
                        id="confirm"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="DELETE"
                        autoComplete="off"
                        className="max-w-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="destructive"
                        onClick={deleteAccount}
                        disabled={busy || !ack || confirm.trim().toUpperCase() !== "DELETE"}
                      >
                        {busy ? "Deleting…" : "Delete my account"}
                      </Button>
                      <Button variant="ghost" onClick={() => navigate({ to: "/account" })}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Read the full{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              ,{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/cookies" className="underline hover:text-foreground">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
