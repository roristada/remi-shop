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
import { getProductStatus } from "@/lib/products/status";
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
import { FlashToast } from "@/components/admin/flash-toast";
import { LicensePricingEditor } from "@/components/admin/license-pricing-editor";
import { getProductLicensePricing } from "@/lib/licenses/admin-queries";

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

  const [product, categories, buyerCount, orderCount, licensePricing, softwareTags] = await Promise.all([
    getAdminProduct(id),
    listCategoryOptions(),
    countProductBuyers(id),
    countProductOrders(id),
    getProductLicensePricing(id),
    listSoftwareTagOptions(),
  ]);
  if (!product) notFound();

  const sp = await searchParams;
  const now = new Date();
  const status = getProductStatus(product, now);
  const price = calculateProductPrice(product, now);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {sp.created && <FlashToast message="สร้างสินค้าแล้ว — เพิ่มรูปและเวอร์ชันต่อได้เลย" />}
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
          <TabsTrigger value="images">รูปภาพ ({product.images.length})</TabsTrigger>
          <TabsTrigger value="versions">เวอร์ชันและไฟล์ ({product.versions.length})</TabsTrigger>
          <TabsTrigger value="license">License ({licensePricing.filter((l) => l.price !== null).length})</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <ProductForm
            action={updateProduct.bind(null, product.id)}
            values={toFormValues(product)}
            categories={categories}
            softwareTags={softwareTags}
            submitLabel="บันทึก"
          />
        </TabsContent>
        <TabsContent value="images">
          <ImageManager
            productId={product.id}
            images={product.images.map((img) => ({
              id: img.id,
              url: previewImageUrl(img.imagePath),
              altTextTH: img.altTextTH ?? "",
              altTextEN: img.altTextEN ?? "",
              isPrimary: img.isPrimary,
            }))}
          />
        </TabsContent>
        <TabsContent value="versions">
          <VersionManager
            productId={product.id}
            buyerCount={buyerCount}
            versions={product.versions.map((v) => ({
              id: v.id,
              versionNumber: v.versionNumber,
              releaseDate: toBangkokDateTimeLocal(v.releaseDate),
              releaseDateLabel: formatBangkokDateTime(v.releaseDate),
              releaseNotesTH: v.releaseNotesTH ?? "",
              releaseNotesEN: v.releaseNotesEN ?? "",
              isLatest: v.isLatest,
              // storagePath is intentionally not sent to the browser.
              files: v.files.map((f) => ({ id: f.id, fileName: f.fileName, fileSize: f.fileSize, fileType: f.fileType })),
            }))}
          />
        </TabsContent>
        <TabsContent value="license">
          <LicensePricingEditor productId={product.id} rows={licensePricing} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
