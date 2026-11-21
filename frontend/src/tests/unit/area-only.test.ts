import { describe, expect, it } from "vitest";
import { areaOnly } from "@/lib/format";

describe("areaOnly", () => {
  it("keeps the locality and city, drops door numbers, streets with numbers, state and PIN", () => {
    expect(areaOnly("12, 3rd Cross, Indiranagar, Bengaluru, Karnataka 560038, India", "Bengaluru")).toBe(
      "Indiranagar, Bengaluru",
    );
  });

  it("keeps at most two locality lines", () => {
    expect(areaOnly("Flat 4B, Prestige Tower, MG Road, Ashok Nagar, Bengaluru", "Bengaluru")).toBe(
      "MG Road, Ashok Nagar, Bengaluru",
    );
  });

  it("drops plus codes and handles an address without the city in it", () => {
    expect(areaOnly("XQ2M+3F, Koramangala", "Bengaluru")).toBe("Koramangala, Bengaluru");
  });

  it("falls back to the city when the address is empty or all numbers", () => {
    expect(areaOnly(null, "Mumbai")).toBe("Mumbai");
    expect(areaOnly("221B, 400001", "Mumbai")).toBe("Mumbai");
  });
});
