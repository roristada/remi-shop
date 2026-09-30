import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import {
  countProductBuyers,
  countProductOrders,
  getAdminProduct,
  listCategoryOptions,
  type AdminProduct,
} from "@/lib/products/admin-queries";
import { updateProduct } from "@/lib/products/admin-actions";
import { listSoftwareTagOptions } from "@/lib/software-tags/queries";
import { getDiscountWindowState, getProductStatus } from "@/lib/products/status";
import { calculateProductPrice, formatTHB } from "@/lib/pricing/calculate";
import { formatBangkokDateTime, toBangkokDateTimeLocal } from "@/lib/datetime";
import { previewImageUrl } from "@/lib/storage/public-url";
import { idSchema } from "@/lib/validation/product";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { ProductStatusBadge } from "@/components/admin/product-status-badge";
import { ScheduleSummary } from "@/components/admin/schedule-summary";
import { PublishControls } from "@/components/admin/publish-controls";
import { ImageManager } from "@/components/admin/image-manager";
import { VersionManager } from "@/components/admin/version-manager";
import { VariantManager, type ManagedVariant } from "@/components/admin/variant-manager";
import { FormSection } from "@/components/admin/form-controls";
import { FlashToast } from "@/components/admin/flash-toast";
import { LicensePricingEditor } from "@/components/admin/license-pricing-editor";
import { getProductLicensePricing } from "@/lib/licenses/admin-queries";
import { countStockTaken } from "@/lib/products/storefront-queries";

const HIDE_INACTIVE = "data-[state=inactive]:hidden";

function toManagedVariant(v: AdminProduct["variants"][number], now: Date): ManagedVariant {
  const price = calculateProductPrice(v, now);
  const window = getDiscountWindowState(v, now);
  return {
    id: v.id,
    nameTH: v.nameTH,
    nameEN: v.nameEN,
    price: v.price.toString(),
    discountPercent: v.discountPercent?.toString() ?? "",
    discountStartAt: toBangkokDateTimeLocal(v.discountStartAt),
    discountEndAt: toBangkokDateTimeLocal(v.discountEndAt),
    stockLimit: v.stockLimit === null ? "" : String(v.stockLimit),
    sortOrder: String(v.sortOrder),
    isActive: v.isActive,
    priceLabel: price.isDiscounted
      ? `${formatTHB(price.finalPrice)} (ปกติ ${formatTHB(price.unitPrice)})`
      : formatTHB(price.unitPrice),
    discountLabel:
      window === "NONE"
        ? null
        : `ส่วนลด ${v.discountPercent?.toString()}% ${formatBangkokDateTime(v.discountStartAt)} – ${formatBangkokDateTime(v.discountEndAt)}${
            window === "ENDED" ? " (สิ้นสุดแล้ว)" : window === "UPCOMING" ? " (ยังไม่เริ่ม)" : ""
          }`,
    taken: v._count.orderItems,
    fileCount: v._count.files,
  };
}

function toFormValues(p: AdminProduct): ProductFormValues {
  const limit = p.downloadLimit;
  return {
    slug: p.slug,
    nameTH: p.nameTH,
    nameEN: p.nameEN,
    descriptionTH: p.descriptionTH,
    descriptionEN: p.descriptionEN,
    categoryId: p.categoryId,
    price: p.price.toString(),
    discountPercent: p.discountPercent?.toString() ?? "",
    discountStartAt: toBangkokDateTimeLocal(p.discountStartAt),
    discountEndAt: toBangkokDateTimeLocal(p.discountEndAt),
    saleStartAt: toBangkokDateTimeLocal(p.saleStartAt),
    saleEndAt: toBangkokDateTimeLocal(p.saleEndAt),
    softwareTagIds: p.softwareTags.map((t) => t.softwareTagId),
    supportedVersion: p.supportedVersion ?? "",
    fileFormat: p.fileFormat ?? "",
    license: p.license ?? "",
    requirementsTH: p.requirementsTH ?? "",
    requirementsEN: p.requirementsEN ?? "",
    downloadLimitMode: limit === null ? "unlimited" : limit === 5 ? "5" : limit === 10 ? "10" : "custom",
    downloadLimitCustom: limit !== null && limit !== 5 && limit !== 10 ? String(limit) : "",
    stockLimit: p.stockLimit === null ? "" : String(p.stockLimit),
    seoTitleTH: p.seoTitleTH ?? "",
    seoTitleEN: p.seoTitleEN ?? "",
    metaDescriptionTH: p.metaDescriptionTH ?? "",
    metaDescriptionEN: p.metaDescriptionEN ?? "",
  };
}

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const now = new Date();
  const [product, categories, buyerCount, orderCount, licensePricing, softwareTags, stockTaken] = await Promise.all([
    getAdminProduct(id),
    listCategoryOptions(),
    countProductBuyers(id),
    countProductOrders(id),
    getProductLicensePricing(id),
    listSoftwareTagOptions(),
    countStockTaken(id, now),
  ]);
  if (!product) notFound();

  const sp = await searchParams;
  const status = getProductStatus(product, now);
  const price = calculateProductPrice(product, now);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {sp.created && <FlashToast message="สร้างสินค้าแล้ว — เพิ่มรูปและเวอร์ชันต่อได้เลย" />}
      {sp.duplicated && (
        <FlashToast
          message={
            sp.imageCopyFailed
              ? "ทำสำเนาแล้ว แต่คัดลอกรูปบางรูปไม่สำเร็จ — เพิ่มเวอร์ชันและไฟล์ก่อนเผยแพร่"
              : "ทำสำเนาแล้ว (ฉบับร่าง) — เพิ่มเวอร์ชันและไฟล์ก่อนเผยแพร่"
          }
        />
      )}
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> สินค้าทั้งหมด
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{product.nameTH}</h1>
            <ProductStatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {product.category.nameTH} · {formatTHB(price.finalPrice)}
            {price.isDiscounted && ` (ลด ${price.discountPercent / 100}% ถึง ${formatBangkokDateTime(price.discountEndsAt)})`}
            {" · "}ผู้ซื้อ {buyerCount.toLocaleString("th-TH")} คน
          </p>
          <ScheduleSummary {...product} now={now} />
        </div>
        <PublishControls productId={product.id} publishStatus={product.publishStatus} hasOrders={orderCount > 0} />
      </header>

      <Tabs defaultValue="details" className="gap-4">
        <TabsList>
          <TabsTrigger value="details">รายละเอียด</TabsTrigger>
          <TabsTrigger value="variants">ตัวเลือก ({product.variants.length})</TabsTrigger>
          <TabsTrigger value="versions">เวอร์ชันและไฟล์ ({product.versions.length})</TabsTrigger>
          <TabsTrigger value="license">License ({licensePricing.filter((l) => l.price !== null).length})</TabsTrigger>
        </TabsList>
        {/* forceMount + hidden keeps unsaved edits when switching tabs. */}
        <TabsContent value="details" forceMount className={`space-y-6 ${HIDE_INACTIVE}`}>
          <FormSection title="รูปภาพ" description="รูปแรกคือรูปหลักที่แสดงหน้าร้าน">
            <ImageManager
              productId={product.id}
              images={product.images.map((img) => ({
                id: img.id,
                url: previewImageUrl(img.imagePath),
                isPrimary: img.isPrimary,
              }))}
            />
          </FormSection>
          <ProductForm
            action={updateProduct.bind(null, product.id)}
            values={toFormValues(product)}
            categories={categories}
            softwareTags={softwareTags}
            submitLabel="บันทึก"
            stockTaken={stockTaken}
            hasVariants={product.variants.length > 0}
            saveOnlyWhenDirty
          />
        </TabsContent>
        <TabsContent value="variants" forceMount className={HIDE_INACTIVE}>
          <VariantManager productId={product.id} variants={product.variants.map((v) => toManagedVariant(v, now))} />
        </TabsContent>
        <TabsContent value="versions" forceMount className={HIDE_INACTIVE}>
          <VersionManager
            productId={product.id}
            buyerCount={buyerCount}
            versions={product.versions.map((v) => ({
              id: v.id,
              versionNumber: v.versionNumber,
              releaseDate: toBangkokDateTimeLocal(v.releaseDate),
              releaseDateLabel: formatBangkokDateTime(v.releaseDate),
              notifiedAtLabel: v.notifiedAt ? formatBangkokDateTime(v.notifiedAt) : null,
              releaseNotesTH: v.releaseNotesTH ?? "",
              releaseNotesEN: v.releaseNotesEN ?? "",
              isLatest: v.isLatest,
              // storagePath is intentionally not sent to the browser.
              files: v.files.map((f) => ({
                id: f.id,
                fileName: f.fileName,
                fileSize: f.fileSize,
                fileType: f.fileType,
                variantId: f.variantId,
              })),
            }))}
            variants={product.variants.map((v) => ({ id: v.id, name: v.nameTH }))}
          />
        </TabsContent>
        <TabsContent value="license" forceMount className={HIDE_INACTIVE}>
          <LicensePricingEditor productId={product.id} rows={licensePricing} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
