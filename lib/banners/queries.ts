import "server-only";
import { prisma } from "@/lib/prisma/client";

/** Most cards the home carousel shows at once; extras wait until an earlier one ends. */
export const MAX_LIVE_BANNERS = 8;
/** Admin list cap — banners are hand-made, so a single page is plenty. */
export const MAX_ADMIN_BANNERS = 50;

const liveWhere = (now: Date) => ({
  isActive: true,
  OR: [{ startAt: null }, { startAt: { lte: now } }],
  AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }],
});

const BANNER_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }];

/**
 * Home-page carousel cards running right now, in admin order. Never render a discount on a card
 * unless it is the card's own admin-written text.
 */
export function listLiveBanners(now: Date) {
  return prisma.announcement.findMany({
    where: liveWhere(now),
    orderBy: BANNER_ORDER,
    take: MAX_LIVE_BANNERS,
    select: {
      id: true,
      titleTH: true,
      titleEN: true,
      descriptionTH: true,
      descriptionEN: true,
      ctaTH: true,
      ctaEN: true,
      link: true,
      theme: true,
      imagePath: true,
      imageFocusX: true,
      imageFocusY: true,
    },
  });
}

export type LiveBanner = Awaited<ReturnType<typeof listLiveBanners>>[number];

export function listAdminBanners() {
  return prisma.announcement.findMany({ orderBy: BANNER_ORDER, take: MAX_ADMIN_BANNERS });
}

export function getAdminBanner(id: string) {
  return prisma.announcement.findUnique({ where: { id } });
}

/** The home-page notice bar, or null when it is switched off or empty. */
export async function getAnnouncementBar() {
  const s = await prisma.storeSetting.findUnique({
    where: { id: 1 },
    select: { announcementBarEnabled: true, announcementBarTH: true, announcementBarEN: true, announcementBarLink: true },
  });
  if (!s?.announcementBarEnabled || !s.announcementBarTH) return null;
  return { textTH: s.announcementBarTH, textEN: s.announcementBarEN, link: s.announcementBarLink };
}

export async function getAnnouncementBarSettings() {
  const s = await prisma.storeSetting.findUnique({
    where: { id: 1 },
    select: { announcementBarEnabled: true, announcementBarTH: true, announcementBarEN: true, announcementBarLink: true },
  });
  return {
    enabled: s?.announcementBarEnabled ?? false,
    textTH: s?.announcementBarTH ?? "",
    textEN: s?.announcementBarEN ?? "",
    link: s?.announcementBarLink ?? "",
  };
}
