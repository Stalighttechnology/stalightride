import { describe, expect, it } from "vitest";
import { haversineKm, parseCoord } from "./utils";

describe("parseCoord", () => {
  it("parses finite numbers and numeric strings from Postgres", () => {
    expect(parseCoord(12.9716)).toBe(12.9716);
    expect(parseCoord("77.6408")).toBe(77.6408);
    expect(parseCoord(" 12.97 ")).toBe(12.97);
  });

  it("returns null for empty or invalid values", () => {
    expect(parseCoord(null)).toBeNull();
    expect(parseCoord(undefined)).toBeNull();
    expect(parseCoord("")).toBeNull();
    expect(parseCoord("   ")).toBeNull();
    expect(parseCoord("not-a-coord")).toBeNull();
    expect(parseCoord(NaN)).toBeNull();
  });
});

describe("haversineKm", () => {
  it("computes 0 km for identical coordinates", () => {
    expect(haversineKm(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
  });

  it("computes accurate distance between two Bengaluru points", () => {
    // Indiranagar (~12.9716, 77.6408) to Domlur (~12.9609, 77.6387) is ~1.2 km
    const km = haversineKm(12.9716, 77.6408, 12.9609, 77.6387);
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.5);
  });
});
