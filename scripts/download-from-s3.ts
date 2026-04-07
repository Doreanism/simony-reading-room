#!/usr/bin/env tsx

/**
 * Downloads assets from S3 into public/a/ and public/d/ for local development.
 *
 * S3 layout (authors/):            Local layout (public/a/):
 *   <file>                            <file>
 *
 * S3 layout (documents/):          Local layout (public/d/):
 *   <key>.pdf                        <key>.pdf
 *   <key>/<N>.webp                   <key>/<N>.webp
 *   <key>/<N>.json                   <key>/<N>.json
 *
 * S3 layout (pagefind/):           Local layout (public/pagefind/):
 *   <file>                            <file>
 *
 * Usage:
 *   tsx scripts/download-from-s3.ts                # download everything
 *   tsx scripts/download-from-s3.ts <document-key> # download one document
 */

import "dotenv/config";
import { writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, dirname } from "path";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.BUCKET;
const REGION = process.env.REGION || "us-west-2";
const PUBLIC_A = "public/a";
const PUBLIC_D = "public/d";
const PUBLIC_PAGEFIND = "public/pagefind";

if (!BUCKET) {
  console.error("BUCKET env var is required");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });

async function needsDownload(localPath: string, s3Size: number): Promise<boolean> {
  if (!existsSync(localPath)) return true;
  return statSync(localPath).size !== s3Size;
}

async function downloadFile(s3Key: string, localPath: string, size: number): Promise<boolean> {
  if (!(await needsDownload(localPath, size))) return false;

  const dir = dirname(localPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })
  );
  const bytes = await response.Body!.transformToByteArray();
  writeFileSync(localPath, bytes);
  console.log(`  ${s3Key} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return true;
}

async function listObjects(prefix: string) {
  const objects: { key: string; size: number }[] = [];
  let token: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key && obj.Size != null) {
        objects.push({ key: obj.Key, size: obj.Size });
      }
    }
    token = response.NextContinuationToken;
  } while (token);

  return objects;
}

async function downloadPrefix(
  s3Prefix: string,
  localDir: string,
  label: string
): Promise<number> {
  console.log(`Listing ${label} in s3://${BUCKET}/${s3Prefix}...`);
  const objects = await listObjects(s3Prefix);

  if (objects.length === 0) {
    console.log(`No ${label} found.`);
    return 0;
  }

  console.log(`Found ${objects.length} ${label} objects.`);

  let downloaded = 0;
  for (const obj of objects) {
    const relativePath = obj.key.replace(new RegExp(`^${s3Prefix}`), "");
    const localPath = join(localDir, relativePath);
    if (await downloadFile(obj.key, localPath, obj.size)) downloaded++;
  }
  return downloaded;
}

// Main
const filterKey = process.argv[2];
let totalDownloaded = 0;

if (filterKey) {
  totalDownloaded += await downloadPrefix(
    `documents/${filterKey}`,
    PUBLIC_D,
    "documents"
  );
} else {
  totalDownloaded += await downloadPrefix("authors/", PUBLIC_A, "authors");
  totalDownloaded += await downloadPrefix("documents/", PUBLIC_D, "documents");
  totalDownloaded += await downloadPrefix("pagefind/", PUBLIC_PAGEFIND, "pagefind");
}

console.log(`\nDone. ${totalDownloaded} file(s) downloaded.`);
