import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

import { ArrowLeft, ImagePlus, Send, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages/$bookingId")({
  component: MessagesPage,
});

function MessagesPage() {
  const { bookingId } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<any[] | null>(null);
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: b } = await api
        .from("bookings")
        .select("*, vehicles(title)")
        .eq("id", bookingId)
        .maybeSingle();
      if (!b) {
        toast.error("Booking not found");
        setAllowed(false);
        navigate({ to: "/bookings" });
        return;
      }
      const party = b.customer_id === user.id || b.vendor_id === user.id;
      if (!party) {
        toast.error("You can only chat about your own bookings");
        setAllowed(false);
        navigate({ to: "/bookings" });
        return;
      }
      setBooking(b);
      setAllowed(true);
      const { data: m } = await api
        .from("messages")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at");
      const rows = m ?? [];
      const senderIds = Array.from(new Set(rows.map((x: any) => x.sender_id)));
      let byId: Record<string, any> = {};
      if (senderIds.length) {
        const { data: profs } = await api
          .from("public_profiles" as any)
          .select("id,full_name,avatar_url")
          .in("id", senderIds);
        byId = Object.fromEntries((profs ?? []).map((a: any) => [a.id, a]));
      }
      setMessages(rows.map((x: any) => ({ ...x, profiles: byId[x.sender_id] ?? null })));
    })();
  }, [bookingId, user, navigate]);

  useEffect(() => {
    if (!allowed) return;
    const ch = api
      .channel(`msgs-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `booking_id=eq.${bookingId}`,
        },
        async (payload) => {
          const { data: prof } = await api
            .from("public_profiles" as any)
            .select("full_name,avatar_url")
            .eq("id", (payload.new as any).sender_id)
            .maybeSingle();
          setMessages((prev) => [...(prev ?? []), { ...(payload.new as any), profiles: prof }]);
        },
      )
      .subscribe();
    return () => {
      api.removeChannel(ch);
    };
  }, [bookingId, allowed]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 999999 });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !allowed || sending) return;
    if (!text.trim() && !pendingImage) return;
    setSending(true);
    try {
      let image_url: string | null = null;
      if (pendingImage) {
        const ext = pendingImage.name.split(".").pop();
        const path = `${user.id}/msg-${bookingId}-${Date.now()}.${ext}`;
        const { error: upErr } = await api.storage
          .from("verification-docs")
          .upload(path, pendingImage);
        if (upErr) throw upErr;
        const { data: signed, error: sErr } = await api.storage
          .from("verification-docs")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (sErr || !signed) throw sErr ?? new Error("sign failed");
        image_url = signed.signedUrl;
      }
      const body = text.trim() || null;
      setText("");
      setPendingImage(null);
      const { error } = await api
        .from("messages")
        .insert({ booking_id: bookingId, sender_id: user.id, body, image_url } as any);
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Could not send");
    } finally {
      setSending(false);
    }
  };

  if (allowed === false)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="font-medium">Chat isn't available for this booking</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Messaging unlocks once you have a confirmed booking with this host.
          </p>
          <Button asChild className="mt-4">
            <Link to="/bookings">Back to bookings</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-3">
          <Link to="/bookings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to bookings
          </Link>
        </Button>
        <Card className="overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3">
            <p className="text-sm text-muted-foreground">Conversation for</p>
            <p className="font-medium">{booking?.vehicles?.title ?? "…"}</p>
          </div>
          <div ref={listRef} className="max-h-[60vh] min-h-[320px] space-y-3 overflow-y-auto p-5">
            {!messages && (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-2/3 rounded-2xl" />
                ))}
              </>
            )}
            {messages && messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">No messages yet — say hi.</p>
            )}
            {messages?.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
                  {!mine && (
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={m.profiles?.avatar_url} />
                      <AvatarFallback>{(m.profiles?.full_name || "?").charAt(0)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[80%] space-y-1 rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noreferrer">
                        <img src={m.image_url} alt="attachment" className="max-h-64 rounded-lg" />
                      </a>
                    )}
                    {m.body && <div>{m.body}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {pendingImage && (
            <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-xs">
              <span className="truncate">Attaching: {pendingImage.name}</span>
              <button
                onClick={() => setPendingImage(null)}
                className="ml-auto rounded p-1 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-border/60 p-3">
            <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-2 py-2 hover:bg-accent">
              <ImagePlus className="h-4 w-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPendingImage(f);
                }}
              />
            </label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
            />
            <Button type="submit" size="icon" disabled={sending || (!text.trim() && !pendingImage)}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
