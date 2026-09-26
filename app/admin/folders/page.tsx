import { requireAdmin } from "@/lib/auth/guards";
import { listAdminFolders } from "@/lib/folders/queries";
import { getProductStatus } from "@/lib/products/status";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { previewImageUrl } from "@/lib/storage/public-url";
import { FolderManager, type ManagedFolder, type ManagedFolderProduct } from "@/components/admin/folder-manager";

export default async function AdminFoldersPage() {
  await requireAdmin();
  const { folders, products } = await listAdminFolders();
  const now = new Date();

  const toProduct = (p: (typeof products)[number]): ManagedFolderProduct => ({
    id: p.id,
    name: p.nameTH,
    price: formatTHB(toHundredths(p.price)),
    status: getProductStatus(p, now),
    imageUrl: p.images[0] ? previewImageUrl(p.images[0].imagePath) : null,
    folderId: p.folderId,
  });
  const managed = products.map(toProduct);

  const managedFolders: ManagedFolder[] = folders.map((f) => ({
    ...f,
    products: managed.filter((p) => p.folderId === f.id),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">โฟลเดอร์</h1>
        <p className="text-sm text-muted-foreground">
          จัดกลุ่มสินค้าเป็นโฟลเดอร์ (เช่น แบรนด์หรือคอลเลกชัน) — หน้าร้านจะแสดงตามลำดับที่เรียงไว้ที่นี่
        </p>
      </div>
      <FolderManager folders={managedFolders} allProducts={managed} />
    </div>
  );
}
