import { MAX_FILE_SIZE } from "@/lib/storage/buckets";

// Magic-byte signatures. A null byte in a pattern means "any byte".
type Signature = { offset?: number; bytes: (number | null)[] };

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

const ZIP: Signature[] = [{ bytes: [0x50, 0x4b, 0x03, 0x04] }, { bytes: [0x50, 0x4b, 0x05, 0x06] }];
const PNG: Signature[] = [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }];
const JPEG: Signature[] = [{ bytes: [0xff, 0xd8, 0xff] }];
const WEBP: Signature[] = [{ bytes: [...ascii("RIFF"), null, null, null, null, ...ascii("WEBP")] }];
const PDF: Signature[] = [{ bytes: ascii("%PDF-") }];
const PSD: Signature[] = [{ bytes: ascii("8BPS") }];
const TIFF: Signature[] = [{ bytes: [0x49, 0x49, 0x2a, 0x00] }, { bytes: [0x4d, 0x4d, 0x00, 0x2a] }];
const FONT: Signature[] = [
  { bytes: [0x00, 0x01, 0x00, 0x00] },
  { bytes: ascii("OTTO") },
  { bytes: ascii("true") },
  { bytes: ascii("ttcf") },
];

type FileRule = { mime: string; signatures?: Signature[] };

/**
 * Allowed digital product file types. Types without a signature are proprietary
 * formats with no stable header; they still pass the generic executable/HTML check.
 */
export const DIGITAL_FILE_TYPES: Record<string, FileRule> = {
  zip: { mime: "application/zip", signatures: ZIP },
  // Brushes
  abr: { mime: "application/octet-stream" }, // Photoshop brushes
  brushset: { mime: "application/zip", signatures: ZIP }, // Procreate
  brush: { mime: "application/zip", signatures: ZIP }, // Procreate
  sut: { mime: "application/octet-stream" }, // Clip Studio
  kpp: { mime: "image/png", signatures: PNG }, // Krita preset
  bundle: { mime: "application/zip", signatures: ZIP }, // Krita bundle
  mdp: { mime: "application/octet-stream" }, // MediBang
  // Procreate
  procreate: { mime: "application/zip", signatures: ZIP },
  swatches: { mime: "application/zip", signatures: ZIP },
  // Photoshop assets
  pat: { mime: "application/octet-stream" },
  grd: { mime: "application/octet-stream" },
  asl: { mime: "application/octet-stream" },
  atn: { mime: "application/octet-stream" },
  tpl: { mime: "application/octet-stream" },
  psd: { mime: "image/vnd.adobe.photoshop", signatures: PSD },
  clip: { mime: "application/octet-stream" },
  // Photo presets / LUTs
  xmp: { mime: "application/xml" },
  lrtemplate: { mime: "text/plain" },
  dng: { mime: "image/x-adobe-dng", signatures: TIFF },
  cube: { mime: "text/plain" },
  // Fonts
  otf: { mime: "font/otf", signatures: FONT },
  ttf: { mime: "font/ttf", signatures: FONT },
  woff: { mime: "font/woff", signatures: [{ bytes: ascii("wOFF") }] },
  woff2: { mime: "font/woff2", signatures: [{ bytes: ascii("wOF2") }] },
  // Images / documents
  png: { mime: "image/png", signatures: PNG },
  jpg: { mime: "image/jpeg", signatures: JPEG },
  jpeg: { mime: "image/jpeg", signatures: JPEG },
  pdf: { mime: "application/pdf", signatures: PDF },
  svg: { mime: "image/svg+xml" },
};

/** Preview images (public bucket) — must be real raster images. */
export const IMAGE_FILE_TYPES: Record<string, FileRule> = {
  jpg: { mime: "image/jpeg", signatures: JPEG },
  jpeg: { mime: "image/jpeg", signatures: JPEG },
  png: { mime: "image/png", signatures: PNG },
  webp: { mime: "image/webp", signatures: WEBP },
};

/** Rejected regardless of extension: executables, scripts, and HTML. */
const FORBIDDEN: Signature[] = [
  { bytes: ascii("MZ") }, // Windows PE
  { bytes: [0x7f, ...ascii("ELF")] },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe] }, // Mach-O
  { bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { bytes: ascii("#!") },
];
const FORBIDDEN_TEXT = /^\s*(<!doctype html|<html|<script)/i;

/** Bytes needed from the start of a file to run every check. */
export const SIGNATURE_BYTES = 64;

export type FileTypeError = "unsupported_type" | "too_large" | "empty" | "signature_mismatch";

export function getExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export function acceptAttribute(rules: Record<string, FileRule>): string {
  return Object.keys(rules).map((ext) => `.${ext}`).join(",");
}

/** Pre-upload check on the metadata the browser claims (size + extension). */
export function checkFileMeta(
  rules: Record<string, FileRule>,
  fileName: string,
  size: number,
): FileTypeError | null {
  if (!(getExtension(fileName) in rules)) return "unsupported_type";
  if (size <= 0) return "empty";
  if (size > MAX_FILE_SIZE) return "too_large";
  return null;
}

function matches(head: Uint8Array, sig: Signature): boolean {
  const offset = sig.offset ?? 0;
  if (head.length < offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => b === null || head[offset + i] === b);
}

/** Post-upload check on the actual stored bytes. */
export function checkFileSignature(
  rules: Record<string, FileRule>,
  fileName: string,
  head: Uint8Array,
): FileTypeError | null {
  const rule = rules[getExtension(fileName)];
  if (!rule) return "unsupported_type";
  if (FORBIDDEN.some((sig) => matches(head, sig))) return "signature_mismatch";
  if (FORBIDDEN_TEXT.test(new TextDecoder("utf-8", { fatal: false }).decode(head))) {
    return "signature_mismatch";
  }
  if (rule.signatures && !rule.signatures.some((sig) => matches(head, sig))) {
    return "signature_mismatch";
  }
  return null;
}

export function mimeFor(rules: Record<string, FileRule>, fileName: string): string {
  return rules[getExtension(fileName)]?.mime ?? "application/octet-stream";
}

export const FILE_TYPE_ERROR_TH: Record<FileTypeError, string> = {
  unsupported_type: "ไม่รองรับไฟล์ประเภทนี้",
  too_large: "ไฟล์ต้องมีขนาดไม่เกิน 5 MB",
  empty: "ไฟล์ว่างเปล่า",
  signature_mismatch: "เนื้อหาไฟล์ไม่ตรงกับนามสกุล",
};
