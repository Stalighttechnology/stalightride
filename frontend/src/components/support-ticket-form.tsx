import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LifeBuoy, Send, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export function SupportTicketForm({ defaultCategory = "Other" }: { defaultCategory?: string }) {
  const { user } = useSession();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [priority, setPriority] = useState<"Urgent" | "High" | "Medium" | "Low">("Medium");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState<any[]>([]);

  const loadMyTickets = async () => {
    if (!user) return;
    const { data } = await api
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setMyTickets(data);
  };

  useEffect(() => {
    loadMyTickets();
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return toast.error("Please sign in to raise a support ticket");
    }
    if (!subject.trim() || !description.trim()) {
      return toast.error("Please provide both subject and description");
    }

    setSubmitting(true);
    const ticketNo = `SYN-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: ticket, error } = await api
      .from("support_tickets")
      .insert({
        ticket_no: ticketNo,
        user_id: user.id,
        subject: subject.trim(),
        category,
        priority,
        status: "Open",
        description: description.trim(),
      })
      .select()
      .single();

    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Insert first message
    await api.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      message: description.trim(),
      is_admin: false,
    });

    setSubmitting(false);
    toast.success(`Ticket ${ticketNo} created! Our team will respond shortly.`);
    setSubject("");
    setDescription("");
    loadMyTickets();
  };

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-brand" /> Raise a Support Ticket
          </CardTitle>
          <CardDescription>
            Have a question or issue? Our customer support and trust & safety teams respond 24/7.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Subject / Issue Summary</Label>
                <Input
                  placeholder="e.g. Security deposit refund inquiry"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Billing">Billing & Deposits</option>
                  <option value="Roadside">Roadside & Breakdown</option>
                  <option value="Safety">Safety & Incident</option>
                  <option value="Account">Account & Verification</option>
                  <option value="Other">Other Inquiry</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Urgency Level</Label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Low">Low — General Question</option>
                  <option value="Medium">Medium — Standard Support</option>
                  <option value="High">High — Booking Issue</option>
                  <option value="Urgent">Urgent — Immediate Attention</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Detailed Description</Label>
                <Textarea
                  placeholder="Describe your issue with booking reference, dates, and what assistance you need..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={submitting}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> {submitting ? "Submitting..." : "Submit Ticket"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Existing User Tickets */}
      {user && myTickets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Your Raised Tickets ({myTickets.length})
          </h3>
          <div className="grid gap-2.5">
            {myTickets.map((t) => (
              <Card key={t.id} className="p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-xs text-brand">{t.ticket_no}</span>
                      <Badge
                        variant={t.status === "Resolved" ? "secondary" : "outline"}
                        className={t.status === "Resolved" ? "bg-emerald-50 text-emerald-700" : ""}
                      >
                        {t.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                    </div>
                    <p className="font-semibold text-xs mt-1 text-foreground">{t.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    {t.resolution && (
                      <div className="mt-2 rounded-md bg-emerald-50/70 dark:bg-emerald-950/20 p-2 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <span className="font-semibold">Support Resolution:</span> {t.resolution}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
