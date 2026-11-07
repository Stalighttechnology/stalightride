import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LifeBuoy, CheckCircle2, Clock, MessageSquare, AlertCircle, Send } from "lucide-react";

interface SupportTicket {
  id: string;
  ticketNo: string;
  userEmail: string;
  subject: string;
  category: "Billing" | "Roadside" | "Safety" | "Account";
  priority: "Urgent" | "High" | "Medium" | "Low";
  status: "Open" | "In Progress" | "Resolved";
  description: string;
  createdAt: string;
  resolution?: string;
}

const INITIAL_TICKETS: SupportTicket[] = [
  {
    id: "t1",
    ticketNo: "SYN-1042",
    userEmail: "karan.v@gmail.com",
    subject: "Security deposit not refunded after trip handover",
    category: "Billing",
    priority: "High",
    status: "Open",
    description: "I returned the vehicle yesterday and inspection was clear, but ₹3000 deposit has not reflected in my bank or wallet.",
    createdAt: "2 hours ago",
  },
  {
    id: "t2",
    ticketNo: "SYN-1039",
    userEmail: "sunil.m@yahoo.com",
    subject: "Driver did not report on time for Bangalore airport trip",
    category: "Roadside",
    priority: "Urgent",
    status: "In Progress",
    description: "Scheduled pickup was 6:00 AM, driver reached at 6:45 AM causing flight check-in rush.",
    createdAt: "5 hours ago",
  },
  {
    id: "t3",
    ticketNo: "SYN-1025",
    userEmail: "deepa.r@gmail.com",
    subject: "Aadhaar upload verification failed on mobile browser",
    category: "Account",
    priority: "Low",
    status: "Resolved",
    description: "Camera capture errored on iOS Safari during driving licence KYC.",
    createdAt: "1 day ago",
    resolution: "Customer re-uploaded front & back JPG via desktop profile; verified manually by admin.",
  },
];

export function SupportTicketsTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>(INITIAL_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");

  const updateStatus = (id: string, status: "Open" | "In Progress" | "Resolved") => {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    if (selectedTicket?.id === id) {
      setSelectedTicket((prev) => (prev ? { ...prev, status } : null));
    }
    toast.success(`Ticket marked as ${status}`);
  };

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setTickets((prev) =>
      prev.map((t) =>
        t.id === selectedTicket.id
          ? { ...t, status: "Resolved", resolution: replyText.trim() }
          : t
      )
    );
    toast.success("Resolution reply sent to user and ticket closed!");
    setSelectedTicket(null);
    setReplyText("");
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "Urgent":
        return <Badge variant="destructive">Urgent</Badge>;
      case "High":
        return <Badge variant="outline" className="text-amber-600 border-amber-300">High</Badge>;
      case "Medium":
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Medium</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          <LifeBuoy className="h-4 w-4 text-brand" /> Customer Support & Helpdesk Tickets
        </h3>
        <span className="text-xs text-muted-foreground">{tickets.length} total tickets</span>
      </div>

      <div className="grid gap-3">
        {tickets.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-brand">{t.ticketNo}</span>
                  <span className="font-semibold text-sm">{t.subject}</span>
                  {getPriorityBadge(t.priority)}
                  <Badge variant={t.status === "Resolved" ? "secondary" : "outline"} className={t.status === "Resolved" ? "bg-emerald-50 text-emerald-700" : ""}>
                    {t.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  User: {t.userEmail} · Category: {t.category} · Filed {t.createdAt}
                </p>
                <p className="text-xs text-foreground mt-2 leading-relaxed">{t.description}</p>
                {t.resolution && (
                  <div className="mt-2 rounded-md bg-muted p-2.5 text-xs text-foreground">
                    <span className="font-semibold text-emerald-700">Resolution:</span> {t.resolution}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {t.status !== "Resolved" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setSelectedTicket(t)} className="text-xs">
                      Reply & Resolve
                    </Button>
                    <Button size="sm" onClick={() => updateStatus(t.id, "Resolved")} className="text-xs">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Close
                    </Button>
                  </>
                )}
              </div>
            </div>

            {selectedTicket?.id === t.id && (
              <form onSubmit={submitReply} className="mt-4 pt-3 border-t border-border space-y-2">
                <Label className="text-xs font-semibold">Write Support Response to {t.userEmail}</Label>
                <Textarea
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Explain resolution or action taken..."
                  required
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedTicket(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    <Send className="mr-1 h-3 w-3" /> Send Resolution
                  </Button>
                </div>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

