import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fallbackConfirm } from "@/components/confirm-dialog";

describe("Confirm Dialog fallback and parser", () => {
  beforeEach(() => {
    (globalThis as any).window = {
      confirm: vi.fn(),
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("handles string messages in fallback mode", async () => {
    (globalThis as any).window.confirm.mockReturnValue(true);
    const ok = await fallbackConfirm("Are you sure you want to delete?");
    expect((globalThis as any).window.confirm).toHaveBeenCalledWith(
      "Are you sure you want to delete?"
    );
    expect(ok).toBe(true);
  });

  it("handles ConfirmOptions objects in fallback mode", async () => {
    (globalThis as any).window.confirm.mockReturnValue(false);
    const ok = await fallbackConfirm({
      title: "Cancel this booking?",
      description: "You'll get ₹9,344.92 back to your wallet.",
    });
    expect((globalThis as any).window.confirm).toHaveBeenCalledWith(
      "Cancel this booking?\n\nYou'll get ₹9,344.92 back to your wallet."
    );
    expect(ok).toBe(false);
  });

  it("handles node environment without window object gracefully", async () => {
    delete (globalThis as any).window;
    const res = await fallbackConfirm("test");
    expect(res).toBe(true);
  });
});
