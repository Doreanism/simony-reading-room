import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { globSync } from 'fs'
import matter from 'gray-matter'
import { globSync as _globSync } from 'glob'

// gray-matter may not be installed; use a simple parser
function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { keys: [] as string[], body: content }
  const keys = match[1]
    .split('\n')
    .map(line => line.match(/^(\w+):/)?.[1])
    .filter(Boolean) as string[]
  const body = content.slice(match[0].length).trim()
  return { keys, body }
}

describe('content frontmatter', () => {
  const contentFiles = _globSync('content/**/*.md', { cwd: process.cwd() })

  it('no content file should have a "description" key in frontmatter (description should be in body)', () => {
    const violations: string[] = []
    for (const file of contentFiles) {
      const content = readFileSync(file, 'utf-8')
      const { keys } = parseFrontmatter(content)
      if (keys.includes('description')) {
        violations.push(file)
      }
    }
    expect(violations, `These files have "description" in frontmatter — it should be the body of the markdown file:\n${violations.join('\n')}`).toEqual([])
  })
})
