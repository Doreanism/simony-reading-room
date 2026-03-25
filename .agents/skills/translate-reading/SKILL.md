---
name: translate-reading
description: Translate a reading transcription from Latin to English. Use when asked to translate a reading or create/redo a translation.
argument-hint: "<reading-key>"
allowed-tools: Read, Write, Glob, Grep, Bash, Agent
---

# Translate a Reading

Translate the reading `$ARGUMENTS` from the transcription file into English.

## Setup

1. Read the reading transcription from `content/readings/transcription/$ARGUMENTS.md`
2. Read the reading meta from `content/readings/meta/$ARGUMENTS.md`
3. Split the transcription into sections, numbering them sequentially starting from 1. Each section should be roughly a page or two of text. Split at `##` headings or page/folio markers so sections start at natural boundaries. For short readings, a single section is fine.
4. Write each section's source text to `/tmp/translation/$ARGUMENTS/source-{N}.md` so agents can read it from disk.

## Translation rules

- Produce fluent, scholarly English
- Preserve the `#`/`##` heading structure from the transcription, translating the heading text
- Include folio markers from the transcription to maintain page references
- Omit page headers and marginal annotations (same as transcription)
- Use standard English forms for scripture references (e.g., "Matthew 10", "1 Corinthians 12")
- Keep Latin legal references but add clarifying notes in brackets where helpful (e.g., `[Extra, de simonia]`)
- Keep proper names in their Latin form (e.g., Petrus, Symon)
- Where the text references canon law (e.g., "extra de simonia", "de restitutione"), keep the Latin reference

## Process

### Initialization

Launch **translation agents** in parallel — one per section. Each agent:

1. Reads its source section from `/tmp/translation/$ARGUMENTS/source-{N}.md`
2. Translates it into fluent, scholarly English following the translation rules above
3. Writes the result to `/tmp/translation/$ARGUMENTS/draft-{N}.md`

The first file (`draft-1.md`) should include frontmatter with only three fields from the reading meta: `title`, `author`, and `section`. Do not copy other meta fields (key, document, description, page ranges, etc.) into the translation. Tell each agent the translation rules and point it at its source file path — do NOT paste the source text into the agent prompt.

Each draft file should already be fluent, scholarly English — not a rough literal translation. This is critical because improvement rounds work best when refining good prose, not rescuing poor drafts.

### Improvement loop

Each improvement round reviews each section's draft against the corresponding source transcription section, looking for:

- **Accuracy errors**: mistranslated words, missed clauses, passages that diverge from the Latin
- **Omissions**: sentences or phrases present in the transcription but missing from the translation
- **Insertions**: text in the translation that has no basis in the transcription
- **Structure mismatches**: missing or misplaced folio markers, headings that don't correspond to the transcription's headings
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

Read the draft files from `/tmp/translation/$ARGUMENTS/` in order (`draft-1.md`, `draft-2.md`, ...) and assemble them into `content/readings/translation/$ARGUMENTS.md`.

## Post-processing

Run `tsx scripts/smartquotes.ts content/readings/translation/$ARGUMENTS.md` to convert straight quotes and apostrophes to typographic (smart) equivalents.

## Verification

After writing the file, verify:
- All folio markers from the transcription are present
- All headings from the transcription have translated equivalents
- The translation starts and ends at the same boundaries as the transcription
