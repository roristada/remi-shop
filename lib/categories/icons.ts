// Drawn category icons the admin can pick (art: components/shop/category-icon.tsx). Pure, no DB.

export const CATEGORY_ICON_KEYS = [
  "brush",
  "base",
  "template",
  "sticker",
  "assets",
  "texture",
  "font",
  "palette",
  "frame",
  "background",
  "model",
  "bubble",
  "bundle",
  "file",
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

/** Admin labels (Thai), with the kinds of category each icon suits. */
export const CATEGORY_ICON_LABEL_TH: Record<CategoryIconKey, string> = {
  brush: "พู่กัน · Brush",
  base: "โครงร่างตัวคน · Base",
  template: "หน้าเทมเพลต · Template",
  sticker: "สติกเกอร์ · Sticker / Emote",
  assets: "รูปทรง · Asset / Element",
  texture: "ลายพื้นผิว · Texture / Pattern",
  font: "ตัวอักษร · Font",
  palette: "จานสี · Palette / Preset",
  frame: "กรอบรูป · Frame / Border",
  background: "ฉากหลัง · Background",
  model: "กล่อง 3D · 3D / Model",
  bubble: "ฟองคำพูด · Speech bubble",
  bundle: "กล่องของขวัญ · Bundle / Pack",
  file: "ไฟล์ทั่วไป",
};

// Checked in order on the slug: specific words first, the catch-all "pack/set" last.
const GUESSES: [RegExp, CategoryIconKey][] = [
  [/brush/, "brush"],
  [/base/, "base"],
  [/template|layout/, "template"],
  [/sticker|emote|emoji/, "sticker"],
  [/asset|element/, "assets"],
  [/texture|pattern/, "texture"],
  [/font|typo/, "font"],
  [/palette|colou?r|preset|swatch/, "palette"],
  [/frame|border/, "frame"],
  [/background|scene|bg/, "background"],
  [/3d|model|mesh/, "model"],
  [/bubble|speech|dialog/, "bubble"],
  [/bundle|pack|set/, "bundle"],
];

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === "string" && (CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}

/** Icon for a slug when the admin has not picked one. */
export function guessIconKey(slug: string): CategoryIconKey {
  return GUESSES.find(([re]) => re.test(slug.toLowerCase()))?.[1] ?? "file";
}

/** The admin's pick when valid, else the slug guess. */
export function resolveIconKey(iconKey: string | null | undefined, slug: string): CategoryIconKey {
  return isCategoryIconKey(iconKey) ? iconKey : guessIconKey(slug);
}
