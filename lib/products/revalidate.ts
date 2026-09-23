import "server-only";
import { revalidatePath } from "next/cache";

/** Product/category changes affect admin lists and every storefront page that lists products. */
export function revalidateCatalog() {
  revalidatePath("/", "layout");
}
