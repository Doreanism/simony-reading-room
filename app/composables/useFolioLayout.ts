export interface Section {
  nodes: any[]
  headingId: string | null
  gridRow: number
}

export interface FolioData {
  page: string
  pdfPage: number
  dividerRow: number
  transcriptionSections: Section[]
  translationSections: Section[]
}

export function useFolioLayout(
  transcriptionColumns: Ref<any[] | null>,
  translationColumns: Ref<any[] | null>,
) {
  const folios = computed<FolioData[]>(() => {
    if (!transcriptionColumns.value) return []
    const transMap = new Map(
      (translationColumns.value ?? []).map((c: any) => [c.page, c]),
    )

    let row = 1
    return transcriptionColumns.value.map((tc: any) => {
      const tl = transMap.get(tc.page)
      const dividerRow = row++

      const transNodes: any[] = tc.body?.value ?? []
      const translNodes: any[] = tl?.body?.value ?? []

      let headingCount = 0
      const sectionCount = Math.max(transNodes.length, translNodes.length)
      const transcriptionSections: Section[] = []
      const translationSections: Section[] = []

      for (let i = 0; i < sectionCount; i++) {
        const gridRow = row++
        const tag = Array.isArray(transNodes[i]) ? transNodes[i][0] : transNodes[i]?.tag
        const isHeading = tag && /^h[1-6]$/.test(tag)
        if (isHeading) headingCount++

        const transId = isHeading ? `${tc.page}-s${headingCount}` : null
        const translId = isHeading ? `${tc.page}-l${headingCount}` : null

        if (transNodes[i]) {
          const node = transId && Array.isArray(transNodes[i])
            ? [transNodes[i][0], { ...transNodes[i][1], id: transId }, ...transNodes[i].slice(2)]
            : transNodes[i]
          transcriptionSections.push({ nodes: [node], headingId: transId, gridRow })
        }
        if (translNodes[i]) {
          const node = translId && Array.isArray(translNodes[i])
            ? [translNodes[i][0], { ...translNodes[i][1], id: translId }, ...translNodes[i].slice(2)]
            : translNodes[i]
          translationSections.push({ nodes: [node], headingId: translId, gridRow })
        }
      }

      return { page: tc.page, pdfPage: tc.pdf_page, dividerRow, transcriptionSections, translationSections }
    })
  })

  return { folios }
}
