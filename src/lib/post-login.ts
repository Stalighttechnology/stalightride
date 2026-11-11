import { api } from "@/lib/api";

/** Where a user lands after signing in, based on their account role. */
export async function landingPathForUser(userId: string): Promise<string> {
  const { data } = await api.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("vendor")) return "/vendor";
  return "/browse";
}
