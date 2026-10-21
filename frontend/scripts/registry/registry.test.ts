/**
 * `registry.json` is generated: it must be what `bun run registry:build`
 * writes today, and every file it ships must find what it imports among the
 * packages and items its item declares.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import {
  buildRegistry,
  importsOf,
  type Registry,
  REGISTRY_PATH,
  REPO,
  resolveImport,
  serialize,
} from './build'

const committed = readFileSync(REGISTRY_PATH, 'utf8')
const registry = JSON.parse(committed) as Registry

/** `@scope/name@^1.2.3` → `@scope/name`. */
function nameOf(dependency: string): string {
  return dependency.slice(0, dependency.lastIndexOf('@'))
}

describe('registry.json', () => {
  it('builds without a problem', () => {
    expect(buildRegistry().problems).toEqual([])
  })

  it('is what the generator writes (run `bun run registry:build`)', () => {
    expect(committed).toBe(serialize(buildRegistry().registry))
  })

  it('covers every import of every file it ships', () => {
    const owner = new Map<string, string>()
    for (const item of registry.items) {
      for (const file of item.files) {
        if (file.path.startsWith('frontend/src/')) {
          owner.set(file.path.slice('frontend/src/'.length), item.name)
        }
      }
    }
    const uncovered = registry.items.flatMap((item) => {
      const packages = new Set(
        [...(item.dependencies ?? []), ...(item.devDependencies ?? [])].map(nameOf),
      )
      const items = new Set([item.name, ...(item.registryDependencies ?? [])])
      return item.files.flatMap((file) => {
        if (!file.path.startsWith('frontend/src/')) return []
        const path = file.path.slice('frontend/src/'.length)
        return importsOf(path).flatMap((specifier) => {
          const resolved = resolveImport(path, specifier)
          if (resolved === null) return []
          if (resolved.kind === 'package') {
            return packages.has(resolved.name) ? [] : [`${item.name}: ${path} → ${specifier}`]
          }
          const from = owner.get(resolved.path)
          const covered = from === item.name || items.has(`${REPO}/${from}`)
          return covered ? [] : [`${item.name}: ${path} → ${specifier}`]
        })
      })
    })
    expect(uncovered).toEqual([])
  })
})
