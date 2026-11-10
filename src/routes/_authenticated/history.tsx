import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/history")({
  beforeLoad: () => {
    throw redirect({ to: "/bookings" });
  },
});
