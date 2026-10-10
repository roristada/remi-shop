import type { LicenseRequestStatus, OrderStatus } from "@/lib/generated/prisma/enums";

// Admin (Thai-only) labels shared by the license list and detail pages.

export const LICENSE_STATUS_TH: Record<LicenseRequestStatus, { label: string; className: string }> = {
  PENDING_REVIEW: { label: "รอพิจารณา", className: "bg-secondary text-secondary-foreground" },
  NEEDS_INFO: { label: "รอข้อมูลจากลูกค้า", className: "bg-warning/15 text-warning" },
  AWAITING_PRICE_CONFIRMATION: { label: "รอลูกค้ายืนยันราคา", className: "bg-warning/15 text-warning" },
  APPROVED: { label: "อนุมัติแล้ว", className: "bg-success/10 text-success" },
  REJECTED: { label: "ปฏิเสธ", className: "bg-destructive/10 text-destructive" },
  CANCELLED: { label: "ลูกค้ายกเลิก", className: "bg-muted text-muted-foreground" },
};

export const ORDER_STATUS_TH: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "รอชำระเงิน",
  WAITING_REVIEW: "รอตรวจสลิป",
  PAYMENT_REJECTED: "สลิปไม่ผ่าน",
  COMPLETED: "ชำระแล้ว (สิทธิ์มีผล)",
  CANCELLED: "ยกเลิก / หมดเวลาชำระ",
};

export const LICENSE_REJECT_REASONS = [
  "ข้อมูลผู้ซื้อหรือศิลปินไม่ครบถ้วน",
  "ลักษณะการใช้งานไม่ตรงกับประเภทที่เลือก",
  "ผลงานไม่ได้ใช้สินค้านี้",
  "ไม่อนุญาตให้ใช้งานในลักษณะนี้",
] as const;
