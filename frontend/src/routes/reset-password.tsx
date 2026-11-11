import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { landingPathForUser } from "@/lib/post-login";

// Opened from the password reset email: /reset-password?uid=...&token=...
export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ uid: z.string().catch(""), token: z.string().catch("") }),
  head: () => ({ meta: [{ title: "Choose a new password — Synchoo" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { uid, token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters long");
    if (password !== confirm) return toast.error("The two passwords do not match");
    setSaving(true);
    const { data, error } = await api.auth.confirmPasswordReset(uid, token, password);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You are signed in.");
    navigate({ to: (await landingPathForUser(data.user!.id)) as any });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h1 className="text-xl font-semibold">Choose a new password</h1>
            {!uid || !token ? (
              <p className="text-sm text-muted-foreground">
                This link is incomplete. Request a new one from the{" "}
                <Link to="/auth" className="underline">
                  sign-in page
                </Link>
                .
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Repeat new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
