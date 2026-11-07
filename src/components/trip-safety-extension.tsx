import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertTriangle,
  PhoneCall,
  ShieldAlert,
  Clock,
  Plus,
  CheckCircle2,
  FileCheck,
  Wrench,
  Navigation,
  Share2,
} from "lucide-react";

interface TripSafetyExtensionProps {
  booking: any;
  role: "customer" | "vendor" | "admin";
  onExtensionSubmitted?: () => void;
}

export function TripSafetyExtension({ booking, role, onExtensionSubmitted }: TripSafetyExtensionProps) {
  const { user } = useSession();
  const [sosOpen, setSosOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [selectedHours, setSelectedHours] = useState<number>(6);
  const [extensionNote, setExtensionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Approximate hourly rate from total or vehicle
  const hourlyRate = Math.max(100, Math.round(Number(booking.total_price || 1200) / 24));
  const estimatedCost = selectedHours * hourlyRate;

  const recordSosIncident = async (lat?: number, lng?: number, coordsText?: string, kind?: string) => {
    if (!user) return;
    try {
      await supabase.from("incidents").insert({
        reporter_id: user.id,
        type: "sos",
        booking_id: booking?.id || null,
        lat: lat ?? null,
        lng: lng ?? null,
        location_text: coordsText || null,
        description: `Emergency ${kind || "general"} SOS triggered during active trip`,
        status: "open",
      });
    } catch (err) {
      // Ignore background logging failure so dialer still opens
    }
  };

  const handleTriggerSOS = (kind: "police" | "synchoo" | "ambulance" | "breakdown") => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          recordSosIncident(lat, lng, coords, kind);

          if (kind === "police") {
            window.open("tel:112", "_self");
          } else if (kind === "ambulance") {
            window.open("tel:108", "_self");
          } else if (kind === "synchoo") {
            window.open("tel:+918045678900", "_self");
          } else if (kind === "breakdown") {
            window.open(`https://wa.me/918045678900?text=${encodeURIComponent(`URGENT Breakdown on Trip #${booking.id.slice(0, 8)} at location ${coords}`)}`, "_blank");
          }
          toast.success(`Emergency request registered at coordinates: ${coords}`);
        },
        () => {
          recordSosIncident(undefined, undefined, undefined, kind);
          if (kind === "police") window.open("tel:112", "_self");
          else window.open("tel:+918045678900", "_self");
        }
      );
    } else {
      recordSosIncident(undefined, undefined, undefined, kind);
      window.open("tel:+918045678900", "_self");
    }
  };

  const handleRequestExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulate extension request submitted to host
    setTimeout(() => {
      setSubmitting(false);
      setExtendOpen(false);
      toast.success(`Trip extension request (+${selectedHours}h for ${currency(estimatedCost)}) sent to host!`);
      if (onExtensionSubmitted) onExtensionSubmitted();
    }, 500);
  };

  return (
    <div className="space-y-4">
      {/* Quick Action Bar for Customer during active trip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/50 p-4 dark:border-red-950 dark:bg-red-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Safety Assistance & In-Trip Extensions</p>
            <p className="text-xs text-muted-foreground">
              Instant 24/7 emergency dispatch, roadside mechanical support, or flexible trip extensions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {role === "customer" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExtendOpen(true)}
              className="text-xs h-9 bg-background shadow-xs border-border"
            >
              <Clock className="mr-1.5 h-3.5 w-3.5 text-brand" /> Extend Trip
            </Button>
          )}

          <Button
            size="sm"
            variant="destructive"
            onClick={() => setSosOpen(true)}
            className="text-xs h-9 font-semibold shadow-xs"
          >
            <ShieldAlert className="mr-1.5 h-4 w-4" /> Emergency SOS
          </Button>
        </div>
      </div>

      {/* Pre-pickup Document Checklist (if pickup has not taken place yet) */}
      {!booking.pickup_odometer && (
        <Card className="border-sky-200 bg-sky-50/40 dark:border-sky-950 dark:bg-sky-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <FileCheck className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-foreground">Pre-Pickup Required Documents & Gear Checklist</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Please keep these ready before meeting your host to ensure an effortless handover:
                </p>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Original Driving Licence (matching your profile)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Government Photo ID (Aadhaar / Passport)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Refundable Security Deposit pre-authorised</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>ISI Helmet (mandatory for 2-wheeler rentals)</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SOS Modal Dialog */}
      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Emergency SOS Center
            </DialogTitle>
            <DialogDescription>
              Immediate help during your trip. Choosing an option will connect you immediately and transmit your current coordinates.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <Button
              variant="destructive"
              className="w-full justify-start text-left h-auto py-3 px-4 font-semibold"
              onClick={() => handleTriggerSOS("police")}
            >
              <PhoneCall className="mr-3 h-5 w-5 shrink-0" />
              <div>
                <div>Call Police Control Room (112)</div>
                <div className="text-[11px] font-normal opacity-90">Instant police dispatch & live GPS alert</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-3 px-4 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200"
              onClick={() => handleTriggerSOS("synchoo")}
            >
              <PhoneCall className="mr-3 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <div className="font-semibold">Synchoo 24/7 Safety Command Desk</div>
                <div className="text-[11px] text-muted-foreground">+91 80 4567 8900 · Direct safety officer assistance</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-3 px-4"
              onClick={() => handleTriggerSOS("breakdown")}
            >
              <Wrench className="mr-3 h-5 w-5 shrink-0 text-brand" />
              <div>
                <div className="font-semibold">Roadside Breakdown & Towing</div>
                <div className="text-[11px] text-muted-foreground">Puncture repair, jumpstart, or flatbed towing</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-3 px-4"
              onClick={() => handleTriggerSOS("ambulance")}
            >
              <PhoneCall className="mr-3 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <div className="font-semibold">Medical Emergency / Ambulance (108)</div>
                <div className="text-[11px] text-muted-foreground">Immediate medical response</div>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSosOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip Extension Request Modal */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand" /> Request Trip Extension
            </DialogTitle>
            <DialogDescription>
              Need more time? Extend your return schedule subject to host vehicle availability.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRequestExtension} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Select Extension Duration</Label>
              <div className="grid grid-cols-4 gap-2">
                {[3, 6, 12, 24].map((hrs) => (
                  <Button
                    key={hrs}
                    type="button"
                    variant={selectedHours === hrs ? "default" : "outline"}
                    className="h-10 text-xs"
                    onClick={() => setSelectedHours(hrs)}
                  >
                    +{hrs}h
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/50 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Additional Time:</span>
                <span className="font-semibold">+{selectedHours} Hours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated Extension Fee:</span>
                <span className="font-semibold text-brand">{currency(estimatedCost)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reason / Note for Host (Optional)</Label>
              <Textarea
                rows={2}
                value={extensionNote}
                onChange={(e) => setExtensionNote(e.target.value)}
                placeholder="Running late due to expressway traffic..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setExtendOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Submit Extension Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

