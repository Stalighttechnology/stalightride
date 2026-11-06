import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { MapPin, Car, Plus, Trash2, CheckCircle2, Sliders } from "lucide-react";

interface CityConfig {
  id: string;
  name: string;
  state: string;
  active: boolean;
  surgeMultiplier: number;
  emergencyPhone: string;
}

interface CategoryConfig {
  id: string;
  name: string;
  key: string;
  minDeposit: number;
  minHours: number;
  commissionPct: number;
  active: boolean;
}

const DEFAULT_CITIES: CityConfig[] = [
  { id: "1", name: "Bengaluru", state: "Karnataka", active: true, surgeMultiplier: 1.0, emergencyPhone: "+91 80 4000 1111" },
  { id: "2", name: "Mumbai", state: "Maharashtra", active: true, surgeMultiplier: 1.1, emergencyPhone: "+91 22 4000 2222" },
  { id: "3", name: "Delhi-NCR", state: "Delhi", active: true, surgeMultiplier: 1.0, emergencyPhone: "+91 11 4000 3333" },
  { id: "4", name: "Hyderabad", state: "Telangana", active: true, surgeMultiplier: 1.0, emergencyPhone: "+91 40 4000 4444" },
  { id: "5", name: "Chennai", state: "Tamil Nadu", active: true, surgeMultiplier: 1.0, emergencyPhone: "+91 44 4000 5555" },
  { id: "6", name: "Pune", state: "Maharashtra", active: false, surgeMultiplier: 1.0, emergencyPhone: "+91 20 4000 6666" },
];

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: "c1", name: "Cars (Petrol / Diesel)", key: "car", minDeposit: 3000, minHours: 4, commissionPct: 10, active: true },
  { id: "c2", name: "Electric Vehicles (EV)", key: "ev", minDeposit: 4000, minHours: 4, commissionPct: 10, active: true },
  { id: "c3", name: "Motorcycles / Superbikes", key: "motorcycle", minDeposit: 1500, minHours: 3, commissionPct: 10, active: true },
  { id: "c4", name: "Scooters", key: "scooter", minDeposit: 1000, minHours: 2, commissionPct: 10, active: true },
  { id: "c5", name: "Bicycles & E-Bikes", key: "bike", minDeposit: 500, minHours: 1, commissionPct: 8, active: true },
];

export function CitiesCategoriesTab() {
  const [cities, setCities] = useState<CityConfig[]>(DEFAULT_CITIES);
  const [categories, setCategories] = useState<CategoryConfig[]>(DEFAULT_CATEGORIES);

  // New city form
  const [newCityName, setNewCityName] = useState("");
  const [newCityState, setNewCityState] = useState("");

  const toggleCityActive = (id: string) => {
    setCities((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
    toast.success("City operational status updated");
  };

  const addCity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return toast.error("Enter city name");
    const city: CityConfig = {
      id: String(Date.now()),
      name: newCityName.trim(),
      state: newCityState.trim() || "India",
      active: true,
      surgeMultiplier: 1.0,
      emergencyPhone: "+91 80 4000 0000",
    };
    setCities([...cities, city]);
    setNewCityName("");
    setNewCityState("");
    toast.success(`${city.name} added to operating cities!`);
  };

  const toggleCategoryActive = (id: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
    toast.success("Category availability updated");
  };

  return (
    <div className="mt-4 space-y-6">
      {/* City Management Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-brand" /> Operating Cities & Local Hubs
            </h3>
            <p className="text-xs text-muted-foreground">Manage active deployment locations and local surge multipliers.</p>
          </div>
        </div>

        {/* Add City Card */}
        <Card className="mb-4">
          <CardContent className="p-3.5">
            <form onSubmit={addCity} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">City Name</Label>
                <Input
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="e.g. Ahmedabad"
                  required
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">State / Region</Label>
                <Input
                  value={newCityState}
                  onChange={(e) => setNewCityState(e.target.value)}
                  placeholder="e.g. Gujarat"
                />
              </div>
              <Button type="submit" size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add City
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Cities Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <Card key={city.id} className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm">{city.name}</p>
                  <p className="text-xs text-muted-foreground">{city.state}</p>
                </div>
                <Badge variant={city.active ? "secondary" : "outline"} className={city.active ? "bg-emerald-50 text-emerald-700" : ""}>
                  {city.active ? "Live" : "Inactive"}
                </Badge>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                <span className="text-muted-foreground">Surge Multiplier:</span>
                <span className="font-mono font-semibold">{city.surgeMultiplier.toFixed(1)}x</span>
              </div>

              <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Accept Bookings</span>
                <Switch checked={city.active} onCheckedChange={() => toggleCityActive(city.id)} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Vehicle Category Management */}
      <div>
        <div className="mb-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-brand" /> Vehicle Categories & Deposit Rules
          </h3>
          <p className="text-xs text-muted-foreground">Configure minimum security deposits and platform fees per category.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">{cat.name}</p>
                <Switch checked={cat.active} onCheckedChange={() => toggleCategoryActive(cat.id)} />
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Min Security Deposit:</span>
                  <span className="font-semibold text-foreground">{currency(cat.minDeposit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Min Booking Window:</span>
                  <span className="font-semibold text-foreground">{cat.minHours} hours</span>
                </div>
                <div className="flex justify-between">
                  <span>Category Platform Fee:</span>
                  <span className="font-semibold text-brand">{cat.commissionPct}%</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
