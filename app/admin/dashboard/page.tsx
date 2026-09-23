import { requireAdmin } from "@/lib/auth/guards";

export default async function AdminDashboardPage() {
  // Every admin page and server action must call requireAdmin() itself —
  // the layout check alone doesn't stop a page from rendering.
  await requireAdmin();
  return <h1 className="text-2xl font-bold">แดชบอร์ด</h1>;
}
