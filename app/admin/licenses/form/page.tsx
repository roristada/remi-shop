import { redirect } from "next/navigation";

/** The shared form became one form per usage type; old links land on the usage-type list. */
export default function AdminLicenseFormPage() {
  redirect("/admin/licenses/types");
}
