/**
 * Verifies that all expected WebP page images and JSON files are present
 * for each document in public/d/.
 *
 * Assets are gitignored and served from S3 in production. Run `npm run download`
 * to pull them locally before running this test.
 *
 * Set SKIP_MISSING_ASSETS=1 to skip documents whose asset directory is absent
 * (e.g. in CI where only a subset of assets are downloaded).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { readYaml } from "./lib/folio.js";

const META_DIR = "content/documents";
const PUBLIC_D = "public/d";

const skipMissing = !!process.env.SKIP_MISSING_ASSETS;

const metaFiles = existsSync(META_DIR)
  ? readdirSync(META_DIR).filter((f) => f.endsWith(".md"))
  : [];

for (const metaFile of metaFiles) {
  const meta = readYaml(join(META_DIR, metaFile));
  const key = meta.key;
  const pages = parseInt(meta.pages);
  const assetDir = join(PUBLIC_D, key);

  describe.skipIf(skipMissing && !existsSync(assetDir))(`${key} assets`, () => {
    it("has all WebP page images", () => {
      const missing: number[] = [];
      for (let i = 1; i <= pages; i++) {
        if (!existsSync(join(assetDir, `${i}.webp`))) missing.push(i);
      }
      expect(missing, `Missing WebP pages: ${missing.join(", ")}`).toEqual([]);
    });

    it("has all JSON page files", () => {
      const missing: number[] = [];
      for (let i = 1; i <= pages; i++) {
        if (!existsSync(join(assetDir, `${i}.json`))) missing.push(i);
      }
      expect(missing, `Missing JSON pages: ${missing.join(", ")}`).toEqual([]);
    });
  });
}
