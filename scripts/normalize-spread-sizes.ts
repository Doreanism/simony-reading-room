#!/usr/bin/env tsx

/**
 * Normalizes page image sizes so that each spread (even page + next odd page)
 * has matching dimensions. Pads the smaller image with transparent pixels:
 * left pages are padded on the left (outer) edge, right pages on the right,
 * so the spine edges stay flush. Height padding is centered top/bottom.
 *
 * Also updates the corresponding page JSON files to adjust coordinates
 * for the new image dimensions.
 *
 * Usage:
 *   tsx scripts/normalize-spread-sizes.ts
 */

import { execSync } from "child_process";
import { readdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PUBLIC_D = "public/d";

if (!existsSync(PUBLIC_D)) {
  console.log("No public/d directory found.");
  process.exit(0);
}

interface AlignedLine {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PageJson {
  pdf_page: number;
  folio: string;
  page_width: number;
  page_height: number;
  image_width: number;
  image_height: number;
  columns: {
    a: AlignedLine[];
    b: AlignedLine[];
  };
}

function updatePageJson(
  jsonPath: string,
  origW: number,
  origH: number,
  newW: number,
  newH: number,
  offsetX: number,
  offsetY: number
) {
  if (!existsSync(jsonPath)) return;

  const json: PageJson = JSON.parse(readFileSync(jsonPath, "utf-8"));

  // Remap normalized coordinates from original dimensions to new padded dimensions
  for (const col of [json.columns.a, json.columns.b]) {
    for (const line of col) {
      // Convert from original-relative (0-1) to pixel, add offset, convert to new-relative
      line.x0 = (line.x0 * origW + offsetX) / newW;
      line.y0 = (line.y0 * origH + offsetY) / newH;
      line.x1 = (line.x1 * origW + offsetX) / newW;
      line.y1 = (line.y1 * origH + offsetY) / newH;

      // Round to 4 decimal places
      line.x0 = Math.round(line.x0 * 10000) / 10000;
      line.y0 = Math.round(line.y0 * 10000) / 10000;
      line.x1 = Math.round(line.x1 * 10000) / 10000;
      line.y1 = Math.round(line.y1 * 10000) / 10000;
    }
  }

  // Update dimensions to reflect padded image
  json.page_width = Math.round((json.page_width / origW) * newW * 100) / 100;
  json.page_height = Math.round((json.page_height / origH) * newH * 100) / 100;
  json.image_width = newW;
  json.image_height = newH;

  writeFileSync(jsonPath, JSON.stringify(json, null, 2));
}

const filterKey = process.argv[2];
const documents = readdirSync(PUBLIC_D, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => !filterKey || d.name === filterKey)
  .map((d) => d.name);

let padded = 0;

for (const documentKey of documents) {
  const dir = join(PUBLIC_D, documentKey);
  const pages = readdirSync(dir)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => parseInt(f.replace(".webp", "")))
    .sort((a, b) => a - b);

  // Pair even pages with the next odd page: (2,3), (4,5), ...
  for (let i = 0; i < pages.length; i++) {
    const left = pages[i];
    if (left % 2 !== 0) continue;
    const right = left + 1;
    if (!pages.includes(right)) continue;

    const leftPath = join(dir, `${left}.webp`);
    const rightPath = join(dir, `${right}.webp`);

    const result = execSync(
      `python3 -c "
from PIL import Image
import json

left = Image.open('${leftPath}')
right = Image.open('${rightPath}')

print(json.dumps({
    'lw': left.width, 'lh': left.height,
    'rw': right.width, 'rh': right.height,
}))
"`,
      { encoding: "utf-8" }
    ).trim();

    const { lw, lh, rw, rh } = JSON.parse(result);

    if (lw === rw && lh === rh) continue;

    const tw = Math.max(lw, rw);
    const th = Math.max(lh, rh);

    console.log(
      `  ${documentKey}: pages ${left}-${right}: ` +
        `${lw}x${lh} / ${rw}x${rh} -> ${tw}x${th}`
    );

    // Left page: pad on left (spine edge stays flush on right)
    if (lw !== tw || lh !== th) {
      const offsetX = tw - lw;
      const offsetY = Math.floor((th - lh) / 2);
      execSync(
        `python3 -c "
from PIL import Image
img = Image.open('${leftPath}')
padded = Image.new('RGBA', (${tw}, ${th}), (0, 0, 0, 0))
padded.paste(img, (${offsetX}, ${offsetY}))
padded.save('${leftPath}')
"`,
        { stdio: "inherit" }
      );
      updatePageJson(
        join(dir, `${left}.json`),
        lw, lh, tw, th, offsetX, offsetY
      );
    }

    // Right page: pad on right (spine edge stays flush on left)
    if (rw !== tw || rh !== th) {
      const offsetX = 0;
      const offsetY = Math.floor((th - rh) / 2);
      execSync(
        `python3 -c "
from PIL import Image
img = Image.open('${rightPath}')
padded = Image.new('RGBA', (${tw}, ${th}), (0, 0, 0, 0))
padded.paste(img, (${offsetX}, ${offsetY}))
padded.save('${rightPath}')
"`,
        { stdio: "inherit" }
      );
      updatePageJson(
        join(dir, `${right}.json`),
        rw, rh, tw, th, offsetX, offsetY
      );
    }

    padded++;
  }
}

console.log(`\nNormalized ${padded} spread(s).`);
