import type { ReactNode } from "react";
import { AccountShell } from "@/components/account/account-shell";

// Same side menu as /account. Auth is enforced in the page.
export default function Layout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
