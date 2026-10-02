import { requireAdmin } from "@/lib/auth/guards";
import { listCategoryOptions, listFolderOptions } from "@/lib/products/admin-queries";
import { listSoftwareTagOptions } from "@/lib/software-tags/queries";
import { listUsageTypes } from "@/lib/licenses/admin-queries";
import { EMPTY_PRODUCT_VALUES, ProductForm } from "@/components/admin/product-form";
import { ProductEditor } from "@/components/admin/product-editor";
import { ImageManager } from "@/components/admin/image-manager";
import { VariantManager } from "@/components/admin/variant-manager";
import { VersionManager } from "@/components/admin/version-manager";
import { LicensePricingEditor } from "@/components/admin/license-pricing-editor";
import { FormSection } from "@/components/admin/form-controls";

/** Same editor as editing: pictures, options and files can all be added before the first save. */
export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requireAdmin();
  const sp = await searchParams;
  const [categories, folders, softwareTags, usageTypes] = await Promise.all([
    listCategoryOptions(),
    listFolderOptions(),
    listSoftwareTagOptions(),
    listUsageTypes(),
  ]);
  // Opened from a folder in the product list: start inside that folder.
  const folder = typeof sp.folder === "string" && folders.some((f) => f.id === sp.folder) ? sp.folder : "none";

  return (
    <ProductEditor
      productId={null}
      publishStatus={null}
      title={<h1 className="text-xl font-bold">เพิ่มสินค้า</h1>}
      tabs={[
        {
          value: "details",
          label: "รายละเอียด",
          content: (
            <>
              <FormSection title="รูปภาพ">
                <ImageManager images={[]} />
              </FormSection>
              <ProductForm
                values={{ ...EMPTY_PRODUCT_VALUES, folderId: folder }}
                categories={categories}
                folders={folders}
                softwareTags={softwareTags}
              />
            </>
          ),
        },
        { value: "variants", label: "ตัวเลือก", content: <VariantManager variants={[]} /> },
        { value: "versions", label: "เวอร์ชันและไฟล์", content: <VersionManager versions={[]} buyerCount={0} /> },
        {
          value: "license",
          label: "License",
          content: (
            <LicensePricingEditor
              rows={usageTypes.map((u) => ({ id: u.id, nameTH: u.nameTH, nameEN: u.nameEN, isActive: u.isActive, price: null }))}
            />
          ),
        },
      ]}
    />
  );
}
