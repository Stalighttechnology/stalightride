import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wishlist")({ component: Wishlist });

function Wishlist() {
  const { user } = useSession();
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => {
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
  useEffect(() => {
    load();
  }, [user?.id]);

  const remove = async (id: string) => {
    await api.from("wishlists").delete().eq("id", id);
    load();
  };

  const paths = (items ?? []).map(
    (w) =>
      w.vehicles?.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0]
        ?.url,
  );
  const urls = useSignedUrls("vehicle-images", paths);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Wishlist</h1>
        {!items && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        )}
        {items && items.length === 0 && (
          <p className="mt-6 text-muted-foreground">No saved vehicles yet.</p>
        )}
        {items && items.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((w) => {
              const v = w.vehicles;
              if (!v) return null;
              const img = v.vehicle_images
                ?.slice()
                .sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
              const url = img ? urls[img.url] : null;
              return (
                <Card key={w.id} className="overflow-hidden">
                  <Link to="/vehicle/$id" params={{ id: v.id }}>
                    <div className="aspect-[4/3] bg-muted">
                      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
                    </div>
                  </Link>
                  <CardContent className="p-4">
                    <div className="truncate font-medium">{v.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{v.city}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-semibold">{currency(v.price_daily)}</span> / day
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => remove(w.id)}>
                        <Heart className="h-4 w-4 fill-foreground text-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
