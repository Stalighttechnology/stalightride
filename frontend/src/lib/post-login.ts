import { api } from "@/lib/api";

/** Where a user lands after signing in, based on their account role. */
export async function landingPathForUser(userId: string): Promise<string> {
  const { data } = await api.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("vendor")) return "/vendor";
  if (roles.includes("cleaner")) return "/cleaner-dashboard";
  if (roles.includes("wash_center")) return "/wash-center-dashboard";
  if (roles.includes("driver")) {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("synchoo_active_role", "driver");
    }
    return "/driver-dashboard";
  }

  // Check driver profile verification status
  const { data: driverData } = await api
    .from("drivers")
    .select("verification_status")
    .eq("id", userId)
    .maybeSingle();
  if (driverData?.verification_status === "approved") {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("synchoo_active_role", "driver");
    }
    return "/driver-dashboard";
  }

  return "/browse";
}
