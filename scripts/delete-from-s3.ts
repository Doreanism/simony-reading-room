#!/usr/bin/env tsx

/**
 * Deletes a document's files from S3.
 *
 * Usage:
 *   tsx scripts/delete-from-s3.ts <document-key>
 *
 * Deletes all objects under documents/<document-key>/ and documents/<document-key>.pdf
 */

import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.BUCKET;
const REGION = process.env.REGION || "us-west-2";

if (!BUCKET) {
  console.error("BUCKET env var is required");
  process.exit(1);
}

const documentKey = process.argv[2];
if (!documentKey) {
  console.error("Usage: tsx scripts/delete-from-s3.ts <document-key>");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });
const prefix = `documents/${documentKey}`;

// List all objects under the prefix (covers both the directory and the .pdf)
const keys: string[] = [];
let token: string | undefined;

do {
  const resp = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    })
  );
  for (const obj of resp.Contents ?? []) {
    if (obj.Key) keys.push(obj.Key);
  }
  token = resp.NextContinuationToken;
} while (token);

if (keys.length === 0) {
  console.log(`No objects found under ${prefix}`);
  process.exit(0);
}

console.log(`Deleting ${keys.length} objects under ${prefix}...`);

// Delete in batches of 1000 (S3 limit)
for (let i = 0; i < keys.length; i += 1000) {
  const batch = keys.slice(i, i + 1000);
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: batch.map((k) => ({ Key: k })) },
    })
  );
}

console.log(`Done. Deleted ${keys.length} object(s).`);
