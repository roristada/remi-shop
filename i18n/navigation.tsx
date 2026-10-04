import type { ComponentProps } from "react";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

const navigation = createNavigation(routing);

export const { redirect, usePathname, useRouter, getPathname } = navigation;

/**
 * Locale-aware Link that does not prefetch by default. Every page is rendered per request, so each
 * prefetched link costs a function invocation; header, filter and product-card links multiplied
 * one page view into several. Pass `prefetch` explicitly to opt back in.
 */
export function Link(props: ComponentProps<typeof navigation.Link>) {
  return <navigation.Link prefetch={false} {...props} />;
}
