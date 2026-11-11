/**
 * Suggested rental rates for new listings.
 * Base bands reflect public self-drive rates seen on Indian rental sites
 * (Zoomcar, Revv) in 2026; adjusted for age, fuel, gearbox, seats and city.
 * Guidance only — hosts set their own price.
 */
type Input = {
  category: string;
  brand: string;
  model: string;
  year: number;
  fuel: string;
  transmission: string;
  seats?: number | null;
  city: string;
};

const BASE_DAILY: Record<string, number> = {
  scooter: 450,
  bike: 550,
  motorcycle: 900,
  car: 1900,
  ev: 2100,
};

const PREMIUM_BRANDS = ["bmw", "mercedes", "audi", "volvo", "jaguar", "lexus", "land rover", "porsche", "mini", "jeep", "toyota fortuner", "royal enfield", "ktm", "harley", "triumph", "kawasaki"];
const METROS = ["mumbai", "delhi", "new delhi", "bengaluru", "bangalore", "gurugram", "gurgaon", "noida", "hyderabad", "pune", "chennai", "goa"];

export function recommendPrice(i: Input) {
  let daily = BASE_DAILY[i.category] ?? 1500;
  const name = `${i.brand} ${i.model}`.toLowerCase();
  if (PREMIUM_BRANDS.some((b) => name.includes(b))) daily *= i.category === "car" ? 2.4 : 1.7;
  const age = Math.max(0, new Date().getFullYear() - Number(i.year || 0));
  daily *= age <= 1 ? 1.12 : age <= 3 ? 1.0 : age <= 6 ? 0.9 : 0.8;
  if (i.category === "car") {
    if (i.transmission === "automatic") daily *= 1.12;
    if (i.fuel === "diesel") daily *= 1.08;
    if (i.fuel === "electric" || i.fuel === "hybrid") daily *= 1.1;
    if ((i.seats ?? 5) >= 7) daily *= 1.45;
  }
  if (METROS.some((c) => i.city.toLowerCase().includes(c))) daily *= 1.1;

  const round = (n: number, step: number) => Math.round(n / step) * step;
  const d = round(daily, 50);
  return {
    daily: d,
    dailyLow: round(d * 0.88, 50),
    dailyHigh: round(d * 1.12, 50),
    hourly: round(d / 10, 5),
    weekly: round(d * 6, 100),
    deposit: round(i.category === "car" || i.category === "ev" ? d * 1.5 : d * 2, 500),
  };
}
