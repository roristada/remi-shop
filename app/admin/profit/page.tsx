import { requireAdmin } from "@/lib/auth/guards";
import { ProfitReport } from "@/components/admin/profit-report";

export default async function AdminProfitPage({ searchParams }: PageProps<"/admin/profit">) {
  await requireAdmin();
  return <ProfitReport sp={await searchParams} />;
}
