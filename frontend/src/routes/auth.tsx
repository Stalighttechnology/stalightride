import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import synchooMark from "@/assets/synchoo-mark.png";
import { landingPathForUser } from "@/lib/post-login";
import { Loader2, Mail, Lock, User, Eye, EyeOff, ArrowRight } from "lucide-react";

const search = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  ref: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  component: AuthPage,
});

function formatAuthError(err: any): string {
  const msg = (err?.message || (typeof err === "string" ? err : "")).trim();
  if (!msg || msg.toLowerCase().includes("failed to fetch")) {
    return "Cannot reach the Synchoo server. Check that the backend is running and try again.";
  }
  return msg;
}

function AuthPage() {
  const { mode: initialMode, ref: referralCode } = Route.useSearch();
  const [tab, setTab] = useState<"signin" | "signup">(
    initialMode === "signup" ? "signup" : "signin",
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  // Keep tab in sync if search param changes
  useEffect(() => {
    if (initialMode === "signup" || initialMode === "signin") {
      setTab(initialMode);
    }
  }, [initialMode]);

  // Redirect if already authenticated
  useEffect(() => {
    api.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        navigate({ to: (await landingPathForUser(data.session.user.id)) as any });
      }
    });

    const { data: authListener } = api.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        navigate({ to: (await landingPathForUser(session.user.id)) as any });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  // Email + Password Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please fill in both email and password");
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().replace(/^["']|["']$/g, "");
      const cleanPassword = password.trim().replace(/^["']|["']$/g, "");
      const { data, error } = await api.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        toast.error(formatAuthError(error));
        setLoading(false);
        return;
      }

      if (data.user) {
        toast.success("Welcome back!");
        navigate({ to: (await landingPathForUser(data.user.id)) as any });
      }
    } catch (err: any) {
      toast.error(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // Email + Password Sign Up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please provide email and password");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await api.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || email.split("@")[0],
            ref: referralCode?.trim() || undefined,
          },
        },
      });

      if (error) {
        toast.error(formatAuthError(error));
        setLoading(false);
        return;
      }

      if (data.session) {
        toast.success("Account created successfully!");
        navigate({ to: (await landingPathForUser(data.session.user.id)) as any });
      } else if (data.user) {
        toast.success(
          "Account created! Please check your email inbox to verify your account before logging in.",
          {
            duration: 6000,
          },
        );
        setTab("signin");
      }
    } catch (err: any) {
      toast.error(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Reset Link
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address first");
      return;
    }

    setLoading(true);
    try {
      const { error } = await api.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error(formatAuthError(error));
      } else {
        toast.success("Password reset link sent! Please check your inbox.");
        setShowForgotPassword(false);
      }
    } catch (err: any) {
      toast.error(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth
  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await api.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        toast.error(formatAuthError(error));
        setLoading(false);
      }
    } catch (err: any) {
      toast.error(formatAuthError(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-muted/30 px-4 py-12">
        {/* Subtle grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border)/.6) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)/.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl animate-pulse"
        />

        <Card className="relative w-full max-w-md animate-fade-in shadow-card border-border/80">
          <CardContent className="p-6 sm:p-8">
            {/* Logo & Header */}
            <div className="mb-6 flex flex-col items-center text-center gap-2">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 border border-brand/20 p-2.5 shadow-xs">
                <img
                  src={synchooMark}
                  alt="Synchoo"
                  className="h-full w-full object-contain drop-shadow-[0_4px_12px_rgba(59,130,246,0.35)]"
                />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {showForgotPassword ? "Reset your password" : "Welcome to Synchoo"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {showForgotPassword
                  ? "Enter your email to receive a password reset link."
                  : "Sign in or create an account to manage rides & bookings."}
              </p>
            </div>

            {showForgotPassword ? (
              /* Forgot Password Form */
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Reset Link
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setShowForgotPassword(false)}
                >
                  Back to Sign In
                </Button>
              </form>
            ) : (
              /* Sign In / Sign Up Tabs */
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as "signin" | "signup")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

                {/* SIGN IN TAB */}
                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="signin-email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signin-email"
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="signin-password">Password</Label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-9 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full h-10 font-semibold" disabled={loading}>
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="mr-2 h-4 w-4" />
                      )}
                      {loading ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </TabsContent>

                {/* SIGN UP TAB */}
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-email"
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="At least 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-9 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full h-10 font-semibold" disabled={loading}>
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="mr-2 h-4 w-4" />
                      )}
                      {loading ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* Google Authentication Button */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full h-11 text-sm font-semibold transition-all hover:bg-accent hover:border-amber-500/40 hover:shadow-sm active:scale-[0.99]"
              onClick={signInWithGoogle}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <svg className="mr-3 h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden>
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              )}
              {loading ? "Connecting..." : "Continue with Google"}
            </Button>

            {/* Footer / Privacy note */}
            <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
              By continuing, you agree to Synchoo&apos;s Terms of Service and Privacy Policy.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
