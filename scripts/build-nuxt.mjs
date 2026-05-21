#!/usr/bin/env node
// Wraps `nuxt build` to relocate proxied asset dirs out of public/ during the build.
// In production /a, /d, /pagefind are served from S3 via routeRules — keeping the
// 80k+ local dev mirror in public/ blows Nitro's prerender asset scan.

import { execSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const PROXIED = ['d', 'a', 'pagefind']
const PUBLIC_DIR = resolve('public')
const STASH_DIR = resolve('.public-stash')

function stash() {
  for (const name of PROXIED) {
    const from = resolve(PUBLIC_DIR, name)
    const to = resolve(STASH_DIR, name)
    if (existsSync(from)) {
      execSync(`mkdir -p "${STASH_DIR}"`)
      renameSync(from, to)
    }
  }
}

function unstash() {
  if (!existsSync(STASH_DIR)) return
  for (const name of PROXIED) {
    const from = resolve(STASH_DIR, name)
    const to = resolve(PUBLIC_DIR, name)
    if (existsSync(from)) renameSync(from, to)
  }
  rmSync(STASH_DIR, { recursive: true, force: true })
}

process.on('exit', unstash)
process.on('SIGINT', () => { unstash(); process.exit(130) })
process.on('SIGTERM', () => { unstash(); process.exit(143) })

try {
  stash()
  execSync('nuxt build', { stdio: 'inherit' })
} finally {
  unstash()
}
