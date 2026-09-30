import { AccountShell } from "@/components/account/account-shell";

// Auth is enforced in each page (layouts don't re-run on client navigation).
export default function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  return <AccountShell>{children}</AccountShell>;
}
