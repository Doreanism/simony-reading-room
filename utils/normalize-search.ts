/**
 * Medieval abbreviation/ligature expansions for search normalization.
 * Maps special characters used in historical Latin OCR to their
 * modern equivalents so users can search with plain text.
 */
const MEDIEVAL_MAP: Record<string, string> = {
  '\u017F': 's',    // ſ  long s
  '\u00AC': '',     // ¬  soft hyphen / line continuation
  '\u00B6': '',     // ¶  pilcrow
  '\uA759': 'quod', // ꝙ  q with diagonal stroke
  '\uA76B': 'us',   // ꝫ  et/us abbreviation
  '\uA770': 'us',   // ꝰ  us modifier
  '\uA751': 'p',    // ꝑ  p with flourish (per/pro)
  '\u204A': 'et',   // ⁊  Tironian et
}

/**
 * Normalize medieval characters to modern equivalents, preserving case.
 * Expands abbreviations, replaces long s, strips combining marks.
 */
export function normalizeText(text: string): string {
  let result = text
  for (const [from, to] of Object.entries(MEDIEVAL_MAP)) {
    result = result.replaceAll(from, to)
  }
  // NFKD decompose then strip combining marks (U+0300–U+036F)
  // This handles macrons (ā→a, ē→e, etc.) and superscript letters
  result = result.normalize('NFKD').replace(/[\u0300-\u036F]/g, '')
  return result
}

/**
 * Normalize text for search: like normalizeText but also lowercased.
 */
export function normalizeSearch(text: string): string {
  return normalizeText(text).toLowerCase()
}
