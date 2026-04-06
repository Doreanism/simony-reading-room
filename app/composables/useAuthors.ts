export function useAuthors() {
  const { data: authors } = useAsyncData('authors', () =>
    queryCollection('authors').all()
  )

  function authorName(slug: string | undefined | null): string {
    if (!slug || slug === 'anonymous') return 'Anonymous'
    return authors.value?.find((a) => a.key === slug)?.name_en ?? slug
  }

  function authorNames(slugs: string[] | undefined | null): string {
    if (!slugs?.length) return 'Anonymous'
    return slugs.map((s) => authorName(s)).join(' & ')
  }

  return { authors, authorName, authorNames }
}
