---
name: translate-reading
description: Translate a reading transcription from Latin to English. Use when asked to translate a reading or create/redo a translation.
argument-hint: "<reading-key>"
allowed-tools: Read, Write, Glob, Grep, Bash, Agent
---

# Translate a Reading

Translate the reading `$ARGUMENTS` from the per-column transcription files into English.

## Setup

1. Read the reading meta from `content/readings/meta/$ARGUMENTS.md`
2. Read all per-column transcription files from `content/readings/transcription/$ARGUMENTS/` sorted by filename (folio order)
3. Group adjacent columns into sections for translation (roughly 1-2 pages each). Split at natural boundaries — `##` headings or column boundaries — so sections start cleanly.
4. Write each section's source text to `/tmp/translation/$ARGUMENTS/source-{N}.md` so agents can read it from disk. Include a comment at the top of each source file listing which columns it covers (e.g., `<!-- columns: 145rb, 145va -->`).

## Translation rules

- Produce fluent, scholarly English
- Preserve the `#`/`##` heading structure from the transcription, translating the heading text
- Omit page headers and marginal annotations (same as transcription)
- Use standard English forms for scripture references (e.g., "Matthew 10", "1 Corinthians 12")
- Keep Latin legal references but add clarifying notes in square brackets where helpful (e.g., `[Extra, de simonia]`)
- Keep proper names in their Latin form (e.g., Petrus, Symon). Do NOT add English equivalents or elaborations — if the source says "Altisiodorus", write "Altisiodorus", not "Altisiodorus [William of Auxerre]"
- Where the text references canon law (e.g., "extra de simonia", "de restitutione"), keep the Latin reference
- Translator elaborations (clarifications not in the source text) must use escaped square brackets `\[like this\]` so they render correctly in markdown and are visually distinct from the source text. Bare `[brackets]` in markdown become link syntax and won't display.

## Process

### Initialization

Launch **translation agents** in parallel — one per section. Each agent:

1. Reads its source section from `/tmp/translation/$ARGUMENTS/source-{N}.md`
2. Translates it into fluent, scholarly English following the translation rules above
3. Writes the result to `/tmp/translation/$ARGUMENTS/draft-{N}.md`

Tell each agent the translation rules and point it at its source file path — do NOT paste the source text into the agent prompt.

Each draft file should already be fluent, scholarly English — not a rough literal translation. This is critical because improvement rounds work best when refining good prose, not rescuing poor drafts.

### Improvement loop

Each improvement round reviews each section's draft against the corresponding source transcription section, looking for:

- **Accuracy errors**: mistranslated words, missed clauses, passages that diverge from the Latin
- **Omissions**: sentences or phrases present in the transcription but missing from the translation
- **Insertions**: text in the translation that has no basis in the transcription
- **Structure mismatches**: headings that don't correspond to the transcription's headings
- **Fluency issues**: awkward phrasing, inconsistent terminology, unclear antecedents
- **Reference handling**: scripture references not in standard English form, canon law references that should be kept in Latin but aren't (or vice versa)

Launch **improvement agents** in parallel — one per section. Each agent:

1. Reads the source section from `/tmp/translation/$ARGUMENTS/source-{N}.md`
2. Reads the current draft from `/tmp/translation/$ARGUMENTS/draft-{N}.md`
3. Compares against each point above
4. If improvements are found: writes the corrected draft back to the file and reports `IMPROVED` with a summary of changes
5. If no improvements are needed: reports `DONE`

Tell each agent the review criteria and point it at both file paths — do NOT paste the source text into the agent prompt.

After all agents complete, print progress (section number, IMPROVED/DONE, summary). For any section that reported `IMPROVED`, re-launch an improvement agent in the next round. Sections that reported `DONE` are finished.

Repeat until all sections report `DONE` or a section has been through 3 rounds, whichever comes first.

## Assembly

Read the draft files from `/tmp/translation/$ARGUMENTS/` in order (`draft-1.md`, `draft-2.md`, ...) and split them into per-column translation files at `content/readings/translation/$ARGUMENTS/{folio_column}.md`.

Each section covers one or more columns (listed in the `<!-- columns: ... -->` comment in the source file). When splitting a section's draft into column files, split at the boundaries that correspond to where columns were joined in the source. Each heading in the translation must appear in the same column as the corresponding transcription heading.

Each per-column file has this frontmatter:
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

Run `tsx scripts/smartquotes.ts` on each per-column translation file to convert straight quotes and apostrophes to typographic (smart) equivalents:
```bash
for f in content/readings/translation/$ARGUMENTS/*.md; do tsx scripts/smartquotes.ts "$f"; done
```

## Verification

After writing the files, verify:
- All column files from the transcription have corresponding translation column files
- All headings from the transcription have translated equivalents at matching depths in the same columns
- The translation starts and ends at the same boundaries as the transcription
- Run `npx vitest run` to check all tests pass
