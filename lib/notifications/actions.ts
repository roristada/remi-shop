"use server";

import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { NotificationType } from "@/lib/generated/prisma/enums";
import {
  NOTIFICATION_PAGE_SIZE,
  notificationTarget,
  parseNotificationParams,
  type NotificationParams,
} from "@/lib/notifications/rules";
import { idSchema } from "@/lib/validation/product";

export type NotificationView = {
  id: string;
  type: NotificationType;
  params: NotificationParams;
  target: { path: string; localized: boolean };
  createdAt: string;
  read: boolean;
};

export type NotificationPage = { items: NotificationView[]; hasMore: boolean };

/** Unread count for the navbar badge; null for guests (the bell is hidden). */
export async function getUnreadNotificationCount(): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}

/**
 * The caller's notifications, newest first. `before` is the last id of the previous page
 * (ids are UUIDv7, so id order is creation order).
 */
export async function loadNotifications(before?: string): Promise<NotificationPage> {
  const user = await getCurrentUser();
  if (!user) return { items: [], hasMore: false };
  const cursor = before !== undefined && idSchema.safeParse(before).success ? before : undefined;

  const rows = await prisma.notification.findMany({
    where: { userId: user.id, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { id: "desc" },
    take: NOTIFICATION_PAGE_SIZE + 1,
    select: { id: true, type: true, params: true, readAt: true, createdAt: true },
  });
  const items = rows.slice(0, NOTIFICATION_PAGE_SIZE).map((r) => {
    const params = parseNotificationParams(r.params);
    return {
      id: r.id,
      type: r.type,
      params,
      target: notificationTarget(r.type, params),
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    };
  });
  return { items, hasMore: rows.length > NOTIFICATION_PAGE_SIZE };
}

/** Scoped to the caller: someone else's id simply matches nothing. */
export async function markNotificationRead(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !idSchema.safeParse(id).success) return;
  await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
