import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { MapPin, Car, Plus, Sliders } from "lucide-react";

interface CityConfig {
  id: string;
  name: string;
  state: string;
  active: boolean;
  surgeMultiplier: number;
}

interface CategoryConfig {
  id: string;
  category: string;
  minDeposit: number;
  minWindowHours: number;
  advanceNoticeHours: number;
}

export function CitiesCategoriesTab() {
  const [cities, setCities] = useState<CityConfig[] | null>(null);
  const [categoryRules, setCategoryRules] = useState<CategoryConfig[] | null>(null);

  // New city form
  const [newCityName, setNewCityName] = useState("");
  const [newCityState, setNewCityState] = useState("");
  const [addingCity, setAddingCity] = useState(false);

  const loadData = async () => {
    // 1. Load cities
    const { data: cityRows, error: cityErr } = await api
      .from("cities")
      .select("*")
      .order("name", { ascending: true });

    if (!cityErr && cityRows) {
      setCities(
        cityRows.map((c) => ({
          id: c.id,
          name: c.name,
          state: c.state || "India",
          active: c.active,
          surgeMultiplier: Number(c.surge_multiplier || 1.0),
        })),
      );
    } else {
      setCities([]);
    }

    // 2. Load category rules
    const { data: catRows, error: catErr } = await api
      .from("category_rules")
      .select("*")
      .order("category", { ascending: true });

    if (!catErr && catRows) {
      setCategoryRules(
        catRows.map((r) => ({
          id: r.id,
          category: r.category,
          minDeposit: Number(r.min_deposit || 2000),
          minWindowHours: Number(r.min_window_hours || 2),
          advanceNoticeHours: Number(r.advance_notice_hours || 2),
        })),
      );
    } else {
      setCategoryRules([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleCityActive = async (id: string, currentActive: boolean) => {
    const next = !currentActive;
    const { error } = await api
      .from("cities")
      .update({ active: next, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCities((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, active: next } : c)) : []));
    toast.success(`City ${next ? "activated" : "deactivated"} successfully`);
  };

  const updateCitySurge = async (id: string, surge: number) => {
    const { error } = await api
      .from("cities")
      .update({ surge_multiplier: surge, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCities((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, surgeMultiplier: surge } : c)) : [],
    );
    toast.success("Surge multiplier updated");
  };

  const addCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return toast.error("Enter city name");

    setAddingCity(true);
    const { data, error } = await api
      .from("cities")
      .insert({
        name: newCityName.trim(),
        state: newCityState.trim() || "India",
        active: true,
        surge_multiplier: 1.0,
      })
      .select()
      .single();

    setAddingCity(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (data) {
      setCities((prev) => [
        ...(prev || []),
        {
          id: data.id,
          name: data.name,
          state: data.state || "India",
          active: data.active,
          surgeMultiplier: Number(data.surge_multiplier || 1.0),
        },
      ]);
    }
    setNewCityName("");
    setNewCityState("");
    toast.success(`${newCityName} added to operating cities!`);
  };

  const updateCategoryRule = async (id: string, minDeposit: number, minWindowHours: number) => {
    const { error } = await api
      .from("category_rules")
      .update({
        min_deposit: minDeposit,
        min_window_hours: minWindowHours,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCategoryRules((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, minDeposit, minWindowHours } : r)) : [],
    );
    toast.success("Category rule parameters saved!");
  };

  if (!cities || !categoryRules) return <Skeleton className="h-44 w-full mt-4" />;

  return (
    <div className="mt-4 space-y-6">
      {/* City Management Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-brand" /> Operating Cities & Local Hubs
            </h3>
            <p className="text-xs text-muted-foreground">
              Manage active deployment locations and local surge multipliers.
            </p>
          </div>
        </div>

        {/* Add City Card */}
        <Card className="mb-4">
          <CardContent className="p-3.5">
            <form onSubmit={addCity} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">City Name</Label>
                <Input
                  placeholder="e.g. Surat, Jaipur"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  className="h-8 text-xs w-44"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State / Region</Label>
                <Input
                  placeholder="e.g. Gujarat, Rajasthan"
                  value={newCityState}
                  onChange={(e) => setNewCityState(e.target.value)}
                  className="h-8 text-xs w-44"
                />
              </div>
              <Button type="submit" size="sm" className="h-8 text-xs" disabled={addingCity}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {addingCity ? "Adding..." : "Add City"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Cities Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <Card key={city.id} className="p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{city.name}</p>
                  <p className="text-xs text-muted-foreground">{city.state}</p>
                </div>
                <Badge
                  variant={city.active ? "secondary" : "outline"}
                  className={city.active ? "bg-emerald-50 text-emerald-700" : ""}
                >
                  {city.active ? "Live" : "Inactive"}
                </Badge>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Surge Multiplier</span>
                <select
                  value={city.surgeMultiplier.toFixed(1)}
                  onChange={(e) => updateCitySurge(city.id, parseFloat(e.target.value))}
                  className="h-7 rounded border border-input bg-background px-1.5 text-xs font-semibold"
                >
                  <option value="1.0">1.0x Normal</option>
                  <option value="1.1">1.1x Peak</option>
                  <option value="1.2">1.2x High</option>
                  <option value="1.3">1.3x Holiday</option>
                  <option value="1.5">1.5x Extreme</option>
                </select>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active for Booking</span>
                <Switch
                  checked={city.active}
                  onCheckedChange={() => toggleCityActive(city.id, city.active)}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Category Rules Configuration */}
      <div>
        <div className="mb-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-brand" /> Category Rules & Minimum Security Deposits
          </h3>
          <p className="text-xs text-muted-foreground">
            Define minimum window hours and required security deposit per vehicle vertical.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {categoryRules.map((rule) => (
            <Card key={rule.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm uppercase tracking-wide text-brand">
                  {rule.category}
                </p>
                <Badge variant="outline" className="text-[10px]">
                  Active Rule
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Min Deposit (₹)</Label>
                  <Input
                    type="number"
                    value={rule.minDeposit}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCategoryRules((prev) =>
                        prev
                          ? prev.map((r) => (r.id === rule.id ? { ...r, minDeposit: val } : r))
                          : [],
                      );
                    }}
                    onBlur={() => updateCategoryRule(rule.id, rule.minDeposit, rule.minWindowHours)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Min Window (Hours)</Label>
                  <Input
                    type="number"
                    value={rule.minWindowHours}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCategoryRules((prev) =>
                        prev
                          ? prev.map((r) => (r.id === rule.id ? { ...r, minWindowHours: val } : r))
                          : [],
                      );
                    }}
                    onBlur={() => updateCategoryRule(rule.id, rule.minDeposit, rule.minWindowHours)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
