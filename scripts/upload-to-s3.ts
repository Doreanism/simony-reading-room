#!/usr/bin/env tsx

/**
 * Uploads local public/d/ and public/a/ files to S3.
 *
 * Local layout (public/d/):        S3 layout (documents/):
 *   <key>.pdf                        <key>.pdf
 *   <key>/<file>                     <key>/<file>
 *
 * Local layout (public/a/):        S3 layout (authors/):
 *   <file>                            <file>
 *
 * Local layout (public/pagefind/): S3 layout (pagefind/):
 *   <file>                            <file>
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
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.BUCKET;
const REGION = process.env.REGION || "us-west-2";
const PUBLIC_D = "public/d";

if (!BUCKET) {
  console.error("BUCKET env var is required");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });

const PUBLIC_A = "public/a";
const PUBLIC_PAGEFIND = "public/pagefind";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".js": "application/javascript",
  ".css": "text/css",
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

const CONCURRENCY = 50;

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

async function uploadFilesConcurrently(
  files: { localPath: string; s3Key: string }[],
  remoteObjects: Map<string, number>
): Promise<number> {
  let uploaded = 0;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ localPath, s3Key }) =>
        uploadFile(localPath, s3Key, remoteObjects)
      )
    );
    uploaded += results.filter(Boolean).length;
  }
  return uploaded;
}

async function uploadDocument(
  documentKey: string,
  remoteObjects: Map<string, number>
) {
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
    const files = readdirSync(pagesDir)
      .filter((f) => f.includes("."))
      .map((f) => ({
        localPath: join(pagesDir, f),
        s3Key: `documents/${documentKey}/${f}`,
      }));
    uploaded += await uploadFilesConcurrently(files, remoteObjects);
  }

  return uploaded;
}

async function uploadAuthors(): Promise<number> {
  if (!existsSync(PUBLIC_A)) return 0;

  console.log("Uploading authors...");
  console.log("  listing remote objects...");
  const remoteObjects = await listRemoteObjects("authors/");
  console.log(`  ${remoteObjects.size} file(s) already on S3`);

  const files = readdirSync(PUBLIC_A)
    .filter((f) => f.includes("."))
    .map((f) => ({ localPath: join(PUBLIC_A, f), s3Key: `authors/${f}` }));
  return uploadFilesConcurrently(files, remoteObjects);
}

async function uploadPagefind(): Promise<number> {
  if (!existsSync(PUBLIC_PAGEFIND)) return 0;

  console.log("Uploading pagefind...");
  console.log("  listing remote objects...");
  const remoteObjects = await listRemoteObjects("pagefind/");
  console.log(`  ${remoteObjects.size} file(s) already on S3`);

  let uploaded = 0;

  function walkDir(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  const files = walkDir(PUBLIC_PAGEFIND).map((localPath) => {
    const relativePath = localPath.slice(PUBLIC_PAGEFIND.length + 1);
    return { localPath, s3Key: `pagefind/${relativePath}` };
  });
  const localKeys = new Set(files.map((f) => f.s3Key));
  uploaded += await uploadFilesConcurrently(files, remoteObjects);

  // Delete stale remote objects (e.g. old content-hashed fragments)
  const staleKeys = [...remoteObjects.keys()].filter((k) => !localKeys.has(k));
  if (staleKeys.length > 0) {
    // DeleteObjects accepts up to 1000 keys per request
    for (let i = 0; i < staleKeys.length; i += 1000) {
      const batch = staleKeys.slice(i, i + 1000);
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        })
      );
    }
    console.log(`  deleted ${staleKeys.length} stale pagefind file(s)`);
  }

  return uploaded;
}

// Main
const filterKey = process.argv[2];
let totalUploaded = 0;

if (filterKey) {
  console.log(`Uploading ${filterKey}...`);
  console.log("  listing remote objects...");
  const remoteObjects = await listRemoteObjects(`documents/${filterKey}`);
  console.log(`  ${remoteObjects.size} file(s) already on S3`);
  totalUploaded = await uploadDocument(filterKey, remoteObjects);
} else {
  // Upload authors
  totalUploaded += await uploadAuthors();

  // Upload pagefind search index
  totalUploaded += await uploadPagefind();

  // Upload documents
  if (existsSync(PUBLIC_D)) {
    const keys = new Set<string>();
    for (const entry of readdirSync(PUBLIC_D, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        keys.add(entry.name);
      } else if (entry.name.endsWith(".pdf")) {
        keys.add(entry.name.replace(".pdf", ""));
      }
    }

    console.log("Listing remote documents...");
    const allRemote = await listRemoteObjects("documents/");
    console.log(`  ${allRemote.size} file(s) already on S3`);

    for (const key of keys) {
      console.log(`Uploading ${key}...`);
      totalUploaded += await uploadDocument(key, allRemote);
    }
  }
}

console.log(`\nDone. ${totalUploaded} file(s) uploaded.`);
