#!/usr/bin/env tsx

/**
 * Uploads local public/d/ files to S3.
 *
 * Local layout (public/d/):        S3 layout (documents/):
 *   <key>.pdf                        <key>.pdf
 *   <key>/<file>                     <key>/<file>
 *
 * Usage:
 *   tsx scripts/upload-to-s3.ts                # upload everything
 *   tsx scripts/upload-to-s3.ts <document-key> # upload one document
 */

import "dotenv/config";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.BUCKET;
const REGION = process.env.REGION || "us-west-2";
const PUBLIC_D = "public/d";

if (!BUCKET) {
  console.error("BUCKET env var is required");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

async function listRemoteObjects(prefix: string): Promise<Map<string, number>> {
  const objects = new Map<string, number>();
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
        objects.set(obj.Key, obj.Size);
      }
    }
    token = response.NextContinuationToken;
  } while (token);

  return objects;
}

async function uploadFile(
  localPath: string,
  s3Key: string,
  remoteObjects: Map<string, number>
): Promise<boolean> {
  const stat = statSync(localPath);
  if (remoteObjects.get(s3Key) === stat.size) {
    return false;
  }

  const body = readFileSync(localPath);
  const ext = extname(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: CONTENT_TYPES[ext] || "application/octet-stream",
    })
  );
  console.log(`  uploaded ${s3Key} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  return true;
}

async function uploadDocument(documentKey: string) {
  console.log(`  listing remote objects...`);
  const remoteObjects = await listRemoteObjects(`documents/${documentKey}`);
  console.log(`  ${remoteObjects.size} file(s) already on S3`);

  let uploaded = 0;

  // Upload PDF
  const pdfPath = join(PUBLIC_D, `${documentKey}.pdf`);
  if (existsSync(pdfPath)) {
    if (await uploadFile(pdfPath, `documents/${documentKey}.pdf`, remoteObjects))
      uploaded++;
  }

  // Upload page images and JSON
  const pagesDir = join(PUBLIC_D, documentKey);
  if (existsSync(pagesDir)) {
    const files = readdirSync(pagesDir).filter(
      (f) => f.includes(".")
    );
    for (const file of files) {
      const localPath = join(pagesDir, file);
      const s3Key = `documents/${documentKey}/${file}`;
      if (await uploadFile(localPath, s3Key, remoteObjects)) uploaded++;
    }
  }

  return uploaded;
}

// Main
const filterKey = process.argv[2];
let totalUploaded = 0;

if (filterKey) {
  console.log(`Uploading ${filterKey}...`);
  totalUploaded = await uploadDocument(filterKey);
} else {
  if (!existsSync(PUBLIC_D)) {
    console.log("No public/d directory found.");
    process.exit(0);
  }

  // Find all document keys: PDFs and subdirectories
  const keys = new Set<string>();
  for (const entry of readdirSync(PUBLIC_D, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      keys.add(entry.name);
    } else if (entry.name.endsWith(".pdf")) {
      keys.add(entry.name.replace(".pdf", ""));
    }
  }

  for (const key of keys) {
    console.log(`Uploading ${key}...`);
    totalUploaded += await uploadDocument(key);
  }
}

console.log(`\nDone. ${totalUploaded} file(s) uploaded.`);
