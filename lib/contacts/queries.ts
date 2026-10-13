import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import type { ContactChannelType } from "@/lib/generated/prisma/enums";

export const CONTACT_CACHE_TAG = "contact-channels";

export type ContactChannelView = { id: string; type: ContactChannelType; label: string; value: string };

/** The store's contact channels in display order. Cached: the footer renders on every page. */
export const listContactChannels = unstable_cache(
  async (): Promise<ContactChannelView[]> =>
    prisma.contactChannel.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, label: true, value: true },
    }),
  ["contact-channels"],
  { tags: [CONTACT_CACHE_TAG] },
);
