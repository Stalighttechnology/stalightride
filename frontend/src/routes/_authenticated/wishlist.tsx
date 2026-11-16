import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { useSavedDrivers } from "@/hooks/use-saved-items";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currency } from "@/lib/format";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { Button } from "@/components/ui/button";
import { Heart, Star, MapPin, BadgeCheck, Clock, Car, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wishlist")({ component: Wishlist });

function Wishlist() {
  const { user } = useSession();
  const { savedDriverIds, toggleSaveDriver } = useSavedDrivers();
  const [items, setItems] = useState<any[] | null>(null);
  const [drivers, setDrivers] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<"vehicles" | "drivers">("vehicles");

  const loadVehicles = async () => {
    if (!user) return;
    const { data } = await api
      .from("wishlists")
      .select(
        "id, vehicles(id,title,brand,model,year,city,price_daily,category,vehicle_images(url,sort_order))",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  };

  const loadDrivers = async () => {
    if (!savedDriverIds || savedDriverIds.length === 0) {
      setDrivers([]);
      return;
    }
    const { data } = await api
      .from("public_drivers")
      .select("*")
      .in("id", savedDriverIds);
    setDrivers(data ?? []);
  };

  useEffect(() => {
    loadVehicles();
  }, [user?.id]);

  useEffect(() => {
    loadDrivers();
  }, [savedDriverIds]);

  const removeVehicle = async (id: string) => {
    await api.from("wishlists").delete().eq("id", id);
    loadVehicles();
  };

  const paths = (items ?? []).map(
    (w) =>
      w.vehicles?.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0]
        ?.url,
  );
  const urls = useSignedUrls("vehicle-images", paths);

  const vehicleCount = items?.length ?? 0;
  const driverCount = drivers?.length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Saved Items</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your favorite self-drive cars, bikes, and verified professional drivers.
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "vehicles" | "drivers")}
          >
            <TabsList>
              <TabsTrigger value="vehicles" className="gap-1.5">
                <Car className="h-4 w-4" />
                Vehicles ({vehicleCount})
              </TabsTrigger>
              <TabsTrigger value="drivers" className="gap-1.5">
                <UserCheck className="h-4 w-4" />
                Drivers ({driverCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tab 1: Vehicles */}
        {activeTab === "vehicles" && (
          <div className="mt-6">
            {!items && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-2xl" />
                ))}
              </div>
            )}
            {items && items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Heart className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="font-semibold text-foreground">No saved vehicles yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browse self-drive cars and bikes, and tap the heart icon to save them for later.
                </p>
                <Button asChild className="mt-4" size="sm">
                  <Link to="/browse">Browse vehicles</Link>
                </Button>
              </div>
            )}
            {items && items.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((w) => {
                  const v = w.vehicles;
                  if (!v) return null;
                  const img = v.vehicle_images
                    ?.slice()
                    .sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
                  const url = img ? urls[img.url] : null;
                  return (
                    <Card key={w.id} className="overflow-hidden group hover:shadow-md transition-shadow">
                      <Link to="/vehicle/$id" params={{ id: v.id }}>
                        <div className="aspect-[4/3] bg-muted relative">
                          {url ? (
                            <img src={url} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="grid h-full place-items-center text-xs text-muted-foreground">
                              No image
                            </div>
                          )}
                          <Badge className="absolute left-3 top-3 rounded-full bg-background/90 capitalize text-foreground">
                            {v.category === "bike" ? "Motorcycle" : v.category}
                          </Badge>
                        </div>
                      </Link>
                      <CardContent className="p-4">
                        <div className="truncate font-medium">{v.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {v.brand} {v.model} · {v.city}
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                          <div className="text-sm">
                            <span className="font-semibold">{currency(v.price_daily)}</span>
                            <span className="text-xs text-muted-foreground"> / day</span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeVehicle(w.id)}
                            className="h-8 w-8 rounded-full text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Remove from saved"
                          >
                            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Drivers */}
        {activeTab === "drivers" && (
          <div className="mt-6">
            {!drivers && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-52 rounded-2xl" />
                ))}
              </div>
            )}
            {drivers && drivers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Heart className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="font-semibold text-foreground">No saved drivers yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Find verified professional drivers and click the heart icon to save them to your favorites.
                </p>
                <Button asChild className="mt-4" size="sm">
                  <Link to="/drivers">Find drivers</Link>
                </Button>
              </div>
            )}
            {drivers && drivers.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {drivers.map((d) => (
                  <Card key={d.id} className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-14 w-14">
                            <AvatarImage src={d.photo_url ?? undefined} alt={d.full_name} />
                            <AvatarFallback>
                              {d.full_name?.charAt(0)?.toUpperCase() ?? "D"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-semibold">{d.full_name}</p>
                              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                            </div>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {d.city} · {d.experience_years} yr{d.experience_years === 1 ? "" : "s"} exp
                            </p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => toggleSaveDriver(d.id, d.full_name)}
                          className="h-9 w-9 shrink-0 rounded-full border-rose-300 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400"
                          title="Remove from saved"
                          aria-label="Remove from saved"
                        >
                          <Heart className="h-4.5 w-4.5 fill-rose-500 text-rose-500" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-1 font-medium">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {Number(d.avg_rating).toFixed(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({d.review_count} review{d.review_count === 1 ? "" : "s"})
                        </span>
                      </div>

                      {d.bio && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">{d.bio}</p>
                      )}

                      <div className="mt-auto flex items-end justify-between gap-2 pt-2 border-t border-border/60">
                        <div>
                          <p className="text-lg font-semibold">
                            {currency(d.daily_rate)}
                            <span className="text-xs font-normal text-muted-foreground">/day</span>
                          </p>
                          {Number(d.hourly_rate) > 0 && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {currency(d.hourly_rate)}/hour
                            </p>
                          )}
                        </div>
                        <Button asChild size="sm">
                          <Link to="/driver/$id" params={{ id: d.id }}>
                            View & hire
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
