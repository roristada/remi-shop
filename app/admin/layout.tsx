import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, LayoutDashboard, Package, Receipt, Settings, Tags, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { fontVariables } from "@/app/fonts";
import { Toaster } from "@/components/ui/sonner";
import "../globals.css";

export const metadata: Metadata = {
  title: "Admin | Remi Shop",
  robots: { index: false, follow: false },
};

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { href: "/admin/products", label: "สินค้า", icon: Package },
  { href: "/admin/categories", label: "หมวดหมู่", icon: Tags },
  { href: "/admin/payments", label: "ตรวจสลิป", icon: BadgeCheck },
  { href: "/admin/orders", label: "คำสั่งซื้อ", icon: Receipt },
  { href: "/admin/customers", label: "ลูกค้า", icon: Users },
  { href: "/admin/settings", label: "ตั้งค่า", icon: Settings },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Server-side role check against the DB. Non-admins get 404.
  await requireAdmin();

  return (
    <html lang="th" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full bg-muted/40">
        <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 md:block">
          <p className="mb-6 px-2 font-bold">Remi Shop Admin</p>
          <nav aria-label="Admin" className="flex flex-col gap-1">
            {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-sidebar-accent"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b bg-sidebar px-2 py-2 md:hidden">
            {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm hover:bg-sidebar-accent"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
