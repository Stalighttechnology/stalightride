import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Clock, MessageSquare, AlertCircle, Send, ArrowLeft } from "lucide-react";

export function SupportTicketsTab() {
  const { user } = useSession();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const loadTickets = async () => {
    const { data, error } = await api
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }
    setTickets(data || []);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const loadMessages = async (ticketId: string) => {
    const { data, error } = await api
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
  };

  const selectTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    loadMessages(ticket.id);
  };

  const updateStatus = async (id: string, status: "Open" | "In Progress" | "Resolved") => {
    const { error } = await api
      .from("support_tickets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setTickets((prev) => (prev ? prev.map((t) => (t.id === id ? { ...t, status } : t)) : []));
    if (selectedTicket?.id === id) {
      setSelectedTicket((prev: any) => (prev ? { ...prev, status } : null));
    }
    toast.success(`Ticket marked as ${status}`);
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket || !user) return;

    setSending(true);

    // 1. Insert admin message
    const { data: newMsg, error: msgError } = await api
      .from("ticket_messages")
      .insert({
        ticket_id: selectedTicket.id,
        sender_id: user.id,
        message: replyText.trim(),
        is_admin: true,
      })
      .select()
      .single();

    if (msgError) {
      setSending(false);
      toast.error(msgError.message);
      return;
    }

    // 2. Mark ticket resolved with resolution text
    const { error: ticketError } = await api
      .from("support_tickets")
      .update({
        status: "Resolved",
        resolution: replyText.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedTicket.id);

    setSending(false);

    if (ticketError) {
      toast.error(ticketError.message);
      return;
    }

    // 3. Update local state
    setMessages((prev) => [...prev, newMsg]);
    setTickets((prev) =>
      prev
        ? prev.map((t) =>
            t.id === selectedTicket.id
              ? { ...t, status: "Resolved", resolution: replyText.trim() }
              : t,
          )
        : [],
    );
    setSelectedTicket((prev: any) =>
      prev ? { ...prev, status: "Resolved", resolution: replyText.trim() } : null,
    );
    setReplyText("");
    toast.success("Resolution reply sent to user and ticket closed!");
  };

  if (!tickets) return <Skeleton className="h-44 w-full mt-4" />;

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "Urgent":
        return <Badge variant="destructive">Urgent</Badge>;
      case "High":
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            High
          </Badge>
        );
      case "Medium":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-300">
            Medium
          </Badge>
        );
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "Open":
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-200">
            Open
          </Badge>
        );
      case "In Progress":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
            In Progress
          </Badge>
        );
      case "Resolved":
        return (
          <Badge
            variant="secondary"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-200"
          >
            Resolved
          </Badge>
        );
      default:
        return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {selectedTicket ? (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => setSelectedTicket(null)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <span className="font-mono font-semibold text-xs text-brand">
                  {selectedTicket.ticket_no}
                </span>
                {getPriorityBadge(selectedTicket.priority)}
                {getStatusBadge(selectedTicket.status)}
              </div>
              <div className="flex items-center gap-1.5">
                {selectedTicket.status !== "Resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 text-emerald-600 border-emerald-200"
                    onClick={() => updateStatus(selectedTicket.id, "Resolved")}
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Mark Resolved
                  </Button>
                )}
                {selectedTicket.status === "Open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => updateStatus(selectedTicket.id, "In Progress")}
                  >
                    <Clock className="mr-1 h-3 w-3" /> In Progress
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-base text-foreground">{selectedTicket.subject}</h3>
              <p className="text-xs text-muted-foreground">
                Category:{" "}
                <span className="font-medium text-foreground">{selectedTicket.category}</span> ·
                Raised: {new Date(selectedTicket.created_at).toLocaleString()}
              </p>
              <div className="mt-2 rounded-lg bg-muted/40 p-3 text-xs text-foreground leading-relaxed">
                {selectedTicket.description}
              </div>
            </div>

            {/* Conversation Messages */}
            {messages.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Message Thread ({messages.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl text-xs ${
                        m.is_admin
                          ? "bg-brand/10 border border-brand/20 ml-6 text-foreground"
                          : "bg-muted border border-border mr-6 text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span className="font-medium">
                          {m.is_admin ? "Support Admin" : "Customer"}
                        </span>
                        <span>
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p>{m.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Reply Form */}
            <form onSubmit={submitReply} className="space-y-3 pt-3 border-t">
              <Textarea
                placeholder="Type resolution reply to customer... (Submitting will resolve ticket and notify customer)"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                className="text-xs"
                required
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs"
                  disabled={sending || !replyText.trim()}
                >
                  <Send className="mr-1 h-3 w-3" />{" "}
                  {sending ? "Sending..." : "Send Reply & Close Ticket"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No support tickets in queue.
            </p>
          ) : (
            tickets.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer transition-all hover:border-brand/50"
                onClick={() => selectTicket(t)}
              >
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-xs text-brand">
                        {t.ticket_no}
                      </span>
                      {getPriorityBadge(t.priority)}
                      {getStatusBadge(t.status)}
                      <Badge variant="outline" className="text-[10px]">
                        {t.category}
                      </Badge>
                    </div>
                    <p className="font-semibold text-xs text-foreground">{t.subject}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Raised: {new Date(t.created_at).toLocaleString()}
                    </p>
                  </div>

                  <Button size="sm" variant="outline" className="text-xs">
                    <MessageSquare className="mr-1 h-3 w-3" /> Open Ticket
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
