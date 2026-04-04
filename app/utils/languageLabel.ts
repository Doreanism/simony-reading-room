export function languageLabel(language: string | undefined | null): string {
  switch (language) {
    case 'latin': return 'Latin'
    case 'czech': return 'Czech'
    case 'early-english': return 'Early Modern English'
    default: return ''
  }
}
