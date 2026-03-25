#!/usr/bin/env tsx

/**
 * Runs the content pipeline for a single document.
 *
 * Usage:
 *   tsx scripts/pipeline.ts <document-key>
 *
 * Pipeline steps (in order):
 *   1. build:images            — render page PNGs from PDF
 *   2. build:normalize-spreads — normalize spread image dimensions
 *   3. build:transcriptions    — reshape JSON → per-column markdown
 *   4. build:readings          — combine columns into reading excerpts
 *
 * Note: Transcription (page images → JSON text) and translation (Latin → English)
 * are done via Claude Code agents, not automated scripts. See README.md.
 */

import { execSync } from "child_process";

const documentKey = process.argv[2];

if (!documentKey) {
  console.error("Usage: tsx scripts/pipeline.ts <document-key>");
  console.error("");
  console.error("Pipeline steps:");
  console.error("  1. build:images            — render page PNGs from PDF");
  console.error("  2. build:normalize-spreads  — normalize spread dimensions");
  console.error("  3. build:transcriptions     — JSON → markdown");
  console.error("  4. build:readings           — combine into reading excerpts");
  console.error("");
  console.error("Transcription and translation are done via Claude Code agents.");
  process.exit(1);
}

const steps: { name: string; cmd: string }[] = [
  { name: "Page images",        cmd: `tsx scripts/build-page-images.ts ${documentKey}` },
  { name: "Normalize spreads",  cmd: `tsx scripts/normalize-spread-sizes.ts ${documentKey}` },
  { name: "Generate markdown",  cmd: `tsx scripts/generate-transcriptions.ts ${documentKey}` },
  { name: "Build readings",     cmd: `tsx scripts/build-readings.ts` },
];

for (const step of steps) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${step.name}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    execSync(step.cmd, { stdio: "inherit" });
  } catch (err: any) {
    console.error(`\nStep "${step.name}" failed (exit code ${err.status}).`);
    console.error(`Command: ${step.cmd}`);
    process.exit(err.status ?? 1);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`  Pipeline complete for ${documentKey}`);
console.log(`${"=".repeat(60)}`);
