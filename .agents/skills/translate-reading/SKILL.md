---
name: translate-reading
description: Translate a reading transcription to English. Use when asked to translate a reading or create/redo a translation.
argument-hint: "<reading-key>"
allowed-tools: Read, Write, Glob, Grep, Bash, Agent
---

# Translate a Reading

Translate the reading `$ARGUMENTS` from the per-column transcription files into English.

## Setup

1. Read the reading meta from `content/readings/meta/$ARGUMENTS.md`
2. Read all per-column transcription files from `content/readings/transcription/$ARGUMENTS/` sorted by filename (folio order)
3. Group adjacent columns into sections for translation (roughly 1-2 pages each). Split at natural boundaries — `##` headings or column boundaries — so sections start cleanly.

## Translation rules

- Produce fluent, scholarly English
- If the source text is already in English (e.g., Middle English), modernize it rather than translating — produce clear modern English while preserving the meaning and scholarly register
- Preserve the `#`/`##` heading structure from the transcription, translating the heading text
- Omit page headers and marginal annotations (same as transcription)
- Use standard English forms for scripture references (e.g., "Matthew 10", "1 Corinthians 12")
- Keep Latin legal references but add clarifying notes in square brackets where helpful (e.g., `[Extra, de simonia]`)
- Keep proper names in their Latin form for patristic authors, medieval canonists, popes, and councils (e.g., Petrus, Symon, Gregorius, Augustinus, Ambrosius, Iohannes). For well-known **biblical figures**, use the standard English form (e.g., Judas not Iudas, Gehazi not Giezi/Iezi, David not Dauid). Do NOT add English equivalents or elaborations — if the source says "Altisiodorus", write "Altisiodorus", not "Altisiodorus [William of Auxerre]"
- Where the text references canon law (e.g., "extra de simonia", "de restitutione"), keep the Latin reference
- Translator elaborations (clarifications not in the source text) must use escaped square brackets `\[like this\]` so they render correctly in markdown and are visually distinct from the source text. Bare `[brackets]` in markdown become link syntax and won't display.

## Process

### Initialization

Launch **translation agents** in parallel — one per section. Each agent:

1. Reads its assigned transcription column files from `content/readings/transcription/$ARGUMENTS/`
2. For context, reads 1 column before and 1 column after its section (if they exist) to understand how the text flows in and out — but only translates the assigned columns
3. Translates the assigned columns into fluent, scholarly English following the translation rules above
4. Writes per-column translation files directly to `content/readings/translation/$ARGUMENTS/{folio_column}.md`

**Critical — block structure matching**: Each translation column file MUST have the same block structure as its corresponding transcription column. A "block" is any non-empty line in the body: lines starting with `#` are heading blocks, all others are paragraph blocks. The sequence and count of heading vs. paragraph blocks must match exactly. Translate ALL paragraphs including short summary/rubric lines (those starting with symbols like `y`, `$`, `|`, or numbers). These are summaria, not marginal annotations — do not omit them.

Tell each agent the translation rules, the block structure requirement, and which column files to read — do NOT paste the source text into the agent prompt. Tell the agent which adjacent columns it can read for context and make clear those are context only, not to be translated.

Each output file should already be fluent, scholarly English — not a rough literal translation. This is critical because improvement rounds work best when refining good prose, not rescuing poor drafts.

Agents must ONLY write to files in `content/readings/translation/$ARGUMENTS/`. Do not write to any other location — no `/tmp/` files, no transcription files, no other directories. Each agent writes only the translation column files it was assigned.

### Improvement loop (REQUIRED — run automatically)

You MUST run improvement rounds immediately after the initial translation completes. Do not stop after the initial translation to report results or wait for the user to tell you to continue — proceed directly into the improvement loop as part of the same task.

Each improvement round reviews each section's translation against the corresponding transcription columns, looking for:

- **Block structure mismatches**: the translation must have the same sequence of heading and paragraph blocks as the transcription (same count, same order). This is the most common failure — verify it first.
- **Accuracy errors**: mistranslated words, missed clauses, passages that diverge from the Latin
- **Omissions**: sentences or phrases present in the transcription but missing from the translation
- **Insertions**: text in the translation that has no basis in the transcription
- **Structure mismatches**: headings that don't correspond to the transcription's headings
- **Fluency issues**: awkward phrasing, inconsistent terminology, unclear antecedents
- **Reference handling**: scripture references not in standard English form, canon law references that should be kept in Latin but aren't (or vice versa)

Launch **improvement agents** in parallel — one per section. Each agent:

1. Reads its assigned transcription column files from `content/readings/transcription/$ARGUMENTS/`
2. Reads the current translation column files from `content/readings/translation/$ARGUMENTS/` for the same columns
3. For context, reads 1 column before and 1 column after its section (both transcription and translation) to check continuity
4. Counts blocks in each transcription column and verifies the translation column has the same count and order — fixes any mismatches first
5. Compares against each point above
6. If improvements are found: writes the corrected translation back to the column file(s) and reports `IMPROVED` with a summary of changes
7. If no improvements are needed: reports `DONE`

Tell each agent the review criteria and which column files to read — do NOT paste the source text into the agent prompt. Agents must ONLY write to their assigned translation column files in `content/readings/translation/$ARGUMENTS/` — no other files.

After all agents complete, print progress (section number, IMPROVED/DONE, summary). For any section that reported `IMPROVED`, re-launch an improvement agent in the next round. Sections that reported `DONE` are finished.

Repeat until all sections report `DONE` or a section has been through 3 rounds, whichever comes first.

## Output

Each per-column translation file has this frontmatter:
```yaml
---
reading: $ARGUMENTS
page: {folio_column}
pdf_page: {pdf_page_number}
sortable_pagination_id: "{folio}_{position}"
---
```

Where `sortable_pagination_id` uses the position mapping: ra=001, rb=002, va=003, vb=004. Example: `145rb` → `"145_002"`. Get the `pdf_page` from the corresponding transcription column file's frontmatter.

## Post-processing

Run `npx tsx scripts/smartquotes.ts` on each per-column translation file to convert straight quotes and apostrophes to typographic (smart) equivalents:
```bash
for f in content/readings/translation/$ARGUMENTS/*.md; do npx tsx scripts/smartquotes.ts "$f"; done
```

## Verification

After writing the files, verify:
- All column files from the transcription have corresponding translation column files
- All headings from the transcription have translated equivalents at matching depths in the same columns
- The translation starts and ends at the same boundaries as the transcription
- Run `npx vitest run` to check all tests pass
