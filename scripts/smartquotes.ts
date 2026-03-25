#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "fs";
import { smartquotesMarkdown } from "./lib/smartquotes.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/smartquotes.ts <file.md>");
  process.exit(1);
}

const content = readFileSync(file, "utf-8");
const result = smartquotesMarkdown(content);
writeFileSync(file, result);
console.log(`Smart quotes applied to ${file}`);
