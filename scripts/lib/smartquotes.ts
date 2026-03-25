/**
 * Convert straight quotes and apostrophes to their typographic ("smart") equivalents
 * in the body of a markdown string, leaving YAML frontmatter untouched.
 */

/**
 * Replace straight quotes with smart quotes in a plain text string.
 *
 * Rules:
 * - Double quotes: opening " after whitespace/start-of-line/opening-paren/bracket,
 *   closing " otherwise.
 * - Single quotes / apostrophes: ' between letters is an apostrophe ('),
 *   opening ' after whitespace/start-of-line/opening-paren/bracket, closing ' otherwise.
 */
export function smartquotes(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "\n";

    if (ch === '"') {
      // Opening if preceded by whitespace, start-of-string, or opening bracket/paren
      if (/[\s(\[]/.test(prev) || i === 0) {
        result += "\u201C"; // "
      } else {
        result += "\u201D"; // "
      }
    } else if (ch === "'") {
      // Apostrophe if between letters (e.g., don't, it's)
      const next = i < text.length - 1 ? text[i + 1] : "";
      if (/\p{L}/u.test(prev) && /\p{L}/u.test(next)) {
        result += "\u2019"; // ' (apostrophe)
      } else if (/[\s(\[]/.test(prev) || i === 0) {
        result += "\u2018"; // '
      } else {
        result += "\u2019"; // '
      }
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Apply smart quotes to a markdown file's body, preserving YAML frontmatter.
 * Also preserves markdown link syntax and inline code.
 */
export function smartquotesMarkdown(content: string): string {
  // Split frontmatter from body
  let frontmatter = "";
  let body = content;

  if (content.startsWith("---")) {
    const endIdx = content.indexOf("\n---", 3);
    if (endIdx !== -1) {
      const fmEnd = endIdx + 4; // include the closing ---\n
      frontmatter = content.slice(0, fmEnd);
      body = content.slice(fmEnd);
    }
  }

  // Process body, protecting markdown links [...](url) and inline code `...`
  // Split into protected and unprotected segments
  const protected_pattern = /(\[[^\]]*\]\([^)]*\)|`[^`]+`)/g;
  const parts = body.split(protected_pattern);

  const processed = parts
    .map((part, i) => {
      // Odd indices are captured groups (protected segments)
      if (i % 2 === 1) return part;
      return smartquotes(part);
    })
    .join("");

  return frontmatter + processed;
}
