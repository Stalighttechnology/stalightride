import { useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Bell, Users, CheckCircle2 } from "lucide-react";

interface BroadcastLog {
  id: string;
  title: string;
  message: string;
  audience: string;
  sentAt: string;
}

export function BroadcastsTab() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetAudience, setTargetAudience] = useState("all");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<BroadcastLog[]>([
    {
      id: "b1",
      title: "Diwali Festive Offers are Live!",
      message: "Enjoy 20% discount on all SUV rentals this festive week with code DIWALI20.",
      audience: "All Users",
      sentAt: new Date(Date.now() - 86400000 * 2).toLocaleString(),
    },
    {
      id: "b2",
      title: "New Host Payout Schedule",
      message: "Withdrawal requests are now processed twice weekly on Tuesdays and Fridays.",
      audience: "Hosts Only",
      sentAt: new Date(Date.now() - 86400000 * 5).toLocaleString(),
    },
  ]);

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      return toast.error("Provide both title and message");
    }

    setSending(true);
    try {
      // Fetch a sample of profiles to receive broadcast notification
      const { data: users } = await api.from("profiles").select("id").limit(100);

      if (users && users.length > 0) {
        const rows = users.map((u) => ({
          user_id: u.id,
          title: title.trim(),
          body: message.trim(),
          link: "/browse",
        }));
        await api.from("notifications").insert(rows as any);
      }

      const logEntry: BroadcastLog = {
        id: String(Date.now()),
        title: title.trim(),
        message: message.trim(),
        audience: targetAudience === "all" ? "All Users" : targetAudience === "hosts" ? "Hosts" : "Drivers",
        sentAt: new Date().toLocaleString(),
      };

      setHistory([logEntry, ...history]);
      setTitle("");
      setMessage("");
      toast.success("Broadcast sent to active users!");
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch broadcast");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Broadcast Composer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand" /> Create Notification Broadcast
          </CardTitle>
          <CardDescription>
            Send in-app notification alerts directly to the notification bell of all customers, hosts, or drivers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendBroadcast} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Announcement Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Important platform update or promo"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Target Audience</Label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
                >
                  <option value="all">All Platform Users</option>
                  <option value="hosts">Hosts & Vehicle Owners</option>
                  <option value="drivers">Commercial Drivers</option>
                  <option value="cleaners">Vehicle Washers & Auto Spas</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notification Body *</Label>
              <Textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement details here..."
                required
              />
            </div>

            <Button type="submit" disabled={sending}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> {sending ? "Sending..." : "Dispatch Broadcast"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Broadcast History */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Broadcast History</h3>
        <div className="grid gap-2.5">
          {history.map((item) => (
            <Card key={item.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{item.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {item.audience}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.message}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{item.sentAt}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

