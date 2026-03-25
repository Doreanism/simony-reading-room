#!/usr/bin/env tsx

/**
 * Downloads document assets from S3 into public/d/ for local development.
 *
 * S3 layout (documents/):          Local layout (public/d/):
 *   <key>.pdf                        <key>.pdf
 *   <key>/<N>.webp                   <key>/<N>.webp
 *   <key>/<N>.json                   <key>/<N>.json
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
const PUBLIC_D = "public/d";

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

// Main
const filterKey = process.argv[2];
const prefix = filterKey ? `documents/${filterKey}` : "documents/";

console.log(`Listing objects in s3://${BUCKET}/${prefix}...`);
const objects = await listObjects(prefix);

if (objects.length === 0) {
  console.log("No objects found.");
  process.exit(0);
}

console.log(`Found ${objects.length} objects.`);

let downloaded = 0;
for (const obj of objects) {
  // S3 key: documents/<key>.pdf or documents/<key>/<N>.webp
  // Local:  public/d/<key>.pdf  or public/d/<key>/<N>.webp
  const relativePath = obj.key.replace(/^documents\//, "");
  const localPath = join(PUBLIC_D, relativePath);
  if (await downloadFile(obj.key, localPath, obj.size)) downloaded++;
}

console.log(`\nDone. ${downloaded} file(s) downloaded.`);
