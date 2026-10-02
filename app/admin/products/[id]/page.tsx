import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import {
  countProductBuyers,
  countProductOrders,
  getAdminProduct,
  listCategoryOptions,
  listFolderOptions,
  type AdminProduct,
} from "@/lib/products/admin-queries";
import { listSoftwareTagOptions } from "@/lib/software-tags/queries";
import { getDiscountWindowState, getProductStatus } from "@/lib/products/status";
import { calculateProductPrice, formatTHB } from "@/lib/pricing/calculate";
import { formatBangkokDateTime, toBangkokDateTimeLocal } from "@/lib/datetime";
import { previewImageUrl } from "@/lib/storage/public-url";
import { idSchema } from "@/lib/validation/product";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { ProductStatusBadge } from "@/components/admin/product-status-badge";
import { ScheduleSummary } from "@/components/admin/schedule-summary";
import { ProductEditor } from "@/components/admin/product-editor";
import { ImageManager } from "@/components/admin/image-manager";
import { VersionManager } from "@/components/admin/version-manager";
import { VariantManager, type ManagedVariant } from "@/components/admin/variant-manager";
import { FormSection } from "@/components/admin/form-controls";
import { LicensePricingEditor } from "@/components/admin/license-pricing-editor";
import { getProductLicensePricing } from "@/lib/licenses/admin-queries";
import { countStockTaken } from "@/lib/products/storefront-queries";

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
    isActive: v.isActive,
    imageUrl: v.imagePath ? previewImageUrl(v.imagePath) : null,
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
    folderId: p.folderId ?? "none",
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

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const now = new Date();
  const [product, categories, folders, buyerCount, orderCount, licensePricing, softwareTags, stockTaken] = await Promise.all([
    getAdminProduct(id),
    listCategoryOptions(),
    listFolderOptions(),
    countProductBuyers(id),
    countProductOrders(id),
    getProductLicensePricing(id),
    listSoftwareTagOptions(),
    countStockTaken(id, now),
  ]);
  if (!product) notFound();

  const status = getProductStatus(product, now);
  const price = calculateProductPrice(product, now);
  const variants = product.variants.map((v) => toManagedVariant(v, now));

  return (
    <ProductEditor
      productId={product.id}
      publishStatus={product.publishStatus}
      hasOrders={orderCount > 0}
      variants={variants.map((v) => ({ id: v.id, name: v.nameTH }))}
      title={
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold">{product.nameTH}</h1>
            <ProductStatusBadge status={status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {product.category.nameTH} · {formatTHB(price.finalPrice)}
            {price.isDiscounted && ` (ลด ${price.discountPercent / 100}% ถึง ${formatBangkokDateTime(price.discountEndsAt)})`}
            {" · "}ผู้ซื้อ {buyerCount.toLocaleString("th-TH")} คน
          </p>
        </div>
      }
      summary={<ScheduleSummary {...product} now={now} />}
      tabs={[
        {
          value: "details",
          label: "รายละเอียด",
          content: (
            <>
              <FormSection title="รูปภาพ">
                <ImageManager images={product.images.map((img) => ({ id: img.id, url: previewImageUrl(img.cardPath ?? img.imagePath) }))} />
              </FormSection>
              <ProductForm
                values={toFormValues(product)}
                categories={categories}
                folders={folders}
                softwareTags={softwareTags}
                stockTaken={stockTaken}
                hasVariants={product.variants.length > 0}
              />
            </>
          ),
        },
        { value: "variants", label: `ตัวเลือก (${product.variants.length})`, content: <VariantManager variants={variants} /> },
        {
          value: "versions",
          label: `เวอร์ชันและไฟล์ (${product.versions.length})`,
          content: (
            <VersionManager
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
            />
          ),
        },
        {
          value: "license",
          label: `License (${licensePricing.filter((l) => l.price !== null).length})`,
          content: <LicensePricingEditor rows={licensePricing} />,
        },
      ]}
    />
  );
}
