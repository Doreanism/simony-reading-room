#!/usr/bin/env tsx

/**
 * Generates WebP images for all pages of each document.
 * Extracts at native resolution — if a page contains an embedded image
 * (typical for scanned documents), it renders at the DPI that matches
 * the embedded image's native resolution. Otherwise falls back to 300 DPI.
 */

import { execSync } from "child_process";
import { readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { readYaml } from "./lib/folio.js";

const DOCUMENTS_META = "content/documents";
const PUBLIC_D = "public/d";

if (!existsSync(DOCUMENTS_META)) {
  console.log("No content/documents directory found.");
  process.exit(0);
}

const filterKey = process.argv[2];
const documents = readdirSync(DOCUMENTS_META)
  .filter((f) => f.endsWith(".md"))
  .filter((f) => !filterKey || f === `${filterKey}.md`);
let converted = 0;

for (const file of documents) {
  const meta = readYaml(join(DOCUMENTS_META, file));
  const documentKey = meta.key;
  const totalPages = parseInt(meta.pages);
  const pdfPath = join(PUBLIC_D, `${documentKey}.pdf`);

  if (!existsSync(pdfPath)) {
    console.warn(`  Skipping ${documentKey}: no PDF at ${pdfPath}`);
    continue;
  }

  const outDir = join(PUBLIC_D, documentKey);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`${documentKey}: ${totalPages} pages`);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const webpFile = join(outDir, `${pageNum}.webp`);
    if (existsSync(webpFile)) continue;

    execSync(
      `python3 -c "
import fitz
from PIL import Image
import io

doc = fitz.open('${pdfPath}')
page = doc[${pageNum - 1}]
pw = page.rect.width

# Find the native resolution by checking embedded images
images = page.get_images()
if images:
    max_w = 0
    for im in images:
        xref = im[0]
        info = doc.extract_image(xref)
        if info['width'] > max_w:
            max_w = info['width']
    dpi = round(max_w / (pw / 72))
else:
    dpi = 300

pix = page.get_pixmap(dpi=dpi)
img = Image.open(io.BytesIO(pix.tobytes('png')))
img.save('${webpFile}', 'WEBP', quality=90)
print(f'  {dpi} DPI ({pix.width}x{pix.height})')
doc.close()
"`,
      { stdio: "inherit" }
    );
    console.log(`  ${documentKey}/${pageNum}.webp`);
    converted++;
  }
}

console.log(`\nConverted ${converted} page(s) to WebP.`);
