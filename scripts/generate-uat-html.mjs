import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "UAT_TEST_GUIDE_TH.md"), "utf8");
const outDir = resolve(root, "tmp", "pdfs");
const output = resolve(outDir, "remi-shop-uat-test-guide-th.html");

const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const inline = (value) => escape(value.trim())
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const lines = source.split(/\r?\n/);
let html = "";
let index = 0;
while (index < lines.length) {
  const line = lines[index].trimEnd();
  if (!line || line === "---") { index += 1; continue; }
  if (line.startsWith("# ")) { html += `<h1>${inline(line.slice(2))}</h1>`; index += 1; continue; }
  if (line.startsWith("## ")) { html += `<h2>${inline(line.slice(3))}</h2>`; index += 1; continue; }
  if (line.startsWith("> ")) { html += `<aside>${inline(line.slice(2))}</aside>`; index += 1; continue; }
  if (line.startsWith("```")) {
    const code = [];
    index += 1;
    while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
    html += `<pre>${escape(code.join("\n"))}</pre>`;
    index += 1;
    continue;
  }
  if (line.startsWith("|")) {
    const rows = [];
    while (index < lines.length && lines[index].startsWith("|")) {
      const current = lines[index++];
      if (!/^\|[\s|:-]+\|$/.test(current)) rows.push(current);
    }
    const parsed = rows.map((row) => row.slice(1, -1).split("|").map((cell) => cell.trim()));
    html += "<table><thead><tr>" + parsed[0].map((cell) => `<th>${inline(cell)}</th>`).join("") + "</tr></thead><tbody>";
    html += parsed.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("");
    html += "</tbody></table>";
    continue;
  }
  if (line.startsWith("- ")) {
    const items = [];
    while (index < lines.length && lines[index].startsWith("- ")) items.push(lines[index++].slice(2));
    html += `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
    continue;
  }
  html += `<p>${inline(line)}</p>`;
  index += 1;
}

const document = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>คู่มือทดสอบระบบ (UAT) - Remi Shop</title>
<style>
@page { size: A4; margin: 20mm 14mm 16mm; @top-center { content: "REMI SHOP | UAT TEST GUIDE"; color: #19324a; font: 8pt Tahoma; } @bottom-right { content: counter(page); color: #697782; font: 8pt Tahoma; } }
* { box-sizing: border-box; } body { color:#24323d; font-family:Tahoma,Arial,sans-serif; font-size:9pt; line-height:1.5; } h1 { color:#19324a; font-size:22pt; line-height:1.2; border-bottom:2px solid #19324a; padding-bottom:5mm; margin:0 0 5mm; } h2 { color:#19324a; font-size:14pt; margin:8mm 0 3mm; padding-bottom:1.5mm; border-bottom:1px solid #b8cbd6; page-break-after:avoid; } p { margin:0 0 2.5mm; } ul { margin:0 0 3mm; padding-left:5mm; } li { margin-bottom:1mm; } code { background:#eaf2f8; border-radius:2px; color:#19324a; padding:1px 3px; font-family:Consolas,monospace; font-size:8pt; } aside { background:#f2faf9; border-left:3px solid #41a6a0; margin:3mm 0; padding:3mm 4mm; } pre { background:#f1f5f8; border:1px solid #d7e0e7; border-radius:3px; padding:3mm; white-space:pre-wrap; font:8pt Consolas,monospace; } table { width:100%; border-collapse:collapse; margin:3mm 0 5mm; font-size:7pt; line-height:1.35; page-break-inside:auto; } thead { display:table-header-group; } tr { page-break-inside:avoid; } th { color:#fff; background:#19324a; font-weight:bold; } th,td { border:1px solid #c8d4dc; padding:2mm; text-align:left; vertical-align:top; } tbody tr:nth-child(even) { background:#f4f8fa; } table td:first-child { font-weight:600; } strong { color:#19324a; }
</style></head><body>${html}</body></html>`;

await mkdir(outDir, { recursive: true });
await writeFile(output, document, "utf8");
console.log(output);
