export type AccountRole = "tenant" | "landlord" | "admin";
export const dashboardHome = (role: AccountRole) =>
  `/dashboard/${role === "admin" ? "admin" : role === "landlord" ? "landlord" : "tenant"}`;
const within = (path: string, base: string) =>
  path === base || path.startsWith(`${base}/`);
export function dashboardRouteAllowed(role: AccountRole, path: string) {
  if (within(path, "/dashboard/admin")) return role === "admin";
  if (within(path, "/dashboard/landlord")) return role === "landlord";
  if (
    within(path, "/dashboard/tenant") ||
    within(path, "/dashboard/housing-requests")
  )
    return role === "tenant";
  if (
    within(path, "/dashboard/rental-tools/insurance") ||
    within(path, "/dashboard/rental-tools/damage-protection")
  )
    return role === "landlord";
  if (within(path, "/dashboard/inquiries")) return role !== "admin";
  if (within(path, "/dashboard/rental-tools")) return role !== "admin";
  return true;
}
