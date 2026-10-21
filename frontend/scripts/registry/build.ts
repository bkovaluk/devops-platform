/**
 * Writes `../registry.json` from `items.ts`.
 *
 * Each item's npm packages and the items it needs come from what its files
 * import: a package becomes `name@^version` at the version package.json pins,
 * a file another item ships becomes `bkovaluk/devops-platform/<item>`. A file
 * that imports something no item ships, a package package.json does not
 * name, or a source file no item claims is a problem, and nothing is written.
 *
 *   bun run registry:build
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { ITEMS, type ItemSpec, UNSHIPPED } from './items'

export const FRONTEND = join(import.meta.dirname, '..', '..')
export const REGISTRY_PATH = join(FRONTEND, '..', 'registry.json')
const SRC = join(FRONTEND, 'src')

export const REPO = 'bkovaluk/devops-platform'

/** Packages every target app already has. */
export const PROVIDED: ReadonlySet<string> = new Set(['react', 'react-dom'])

const TEST_FILE = /\.(test|stories)\.tsx?$/

export type Resolved = { kind: 'package'; name: string } | { kind: 'file'; path: string } | null

export interface RegistryFile {
  path: string
  type: string
  target: string
}

export interface RegistryItem {
  name: string
  type: string
  title: string
  description: string
  extends?: string
  dependencies?: string[]
  devDependencies?: string[]
  registryDependencies?: string[]
  files: RegistryFile[]
  categories?: string[]
}

export interface Registry {
  $schema: string
  name: string
  homepage: string
  items: RegistryItem[]
}

/** Every module specifier a source file names: imports, re-exports, dynamic
 *  imports, and a stylesheet's `@import`. */
export function importsOf(path: string): string[] {
  const code = readFileSync(join(SRC, path), 'utf8')
  if (path.endsWith('.css')) {
    return [...code.matchAll(/^@import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')
  }
  if (!/\.tsx?$/.test(path)) return []
  return [
    ...code.matchAll(/^(?:import|export)\b[^'\n]*\bfrom\s*'([^']+)'/gm),
    ...code.matchAll(/^import\s*'([^']+)'/gm),
    ...code.matchAll(/^\}\s*from\s*'([^']+)'/gm),
    ...code.matchAll(/import\(\s*'([^']+)'\s*\)/g),
  ].map((m) => m[1] ?? '')
}

/** `@scope/name/sub` → `@scope/name`; `name/sub` → `name`. */
export function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

/** What a specifier in `from` names: a package or a file under `src/`.
 *  `node:` builtins and the packages every app has are null. */
export function resolveImport(from: string, specifier: string): Resolved {
  let path: string
  if (specifier.startsWith('@/')) path = specifier.slice(2)
  else if (specifier.startsWith('.')) path = posix.join(posix.dirname(from), specifier)
  else {
    const name = packageName(specifier)
    return specifier.startsWith('node:') || PROVIDED.has(name) ? null : { kind: 'package', name }
  }
  for (const extension of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = path + extension
    const absolute = join(SRC, candidate)
    if (existsSync(absolute) && statSync(absolute).isFile())
      return { kind: 'file', path: candidate }
  }
  return { kind: 'file', path }
}

/** Every file under `src/` an app could ship: tests and stories aside. */
export function sourceFiles(directory = SRC, prefix = ''): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry}` : entry
    const absolute = join(directory, entry)
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute, path)
    return TEST_FILE.test(entry) ? [] : [path]
  })
}

function target(path: string): string {
  if (path.startsWith('components/ui/')) return `@ui/${path.slice('components/ui/'.length)}`
  if (path.startsWith('components/')) return `@components/${path.slice('components/'.length)}`
  if (path.startsWith('lib/')) return `@lib/${path.slice('lib/'.length)}`
  return `~/src/${path}`
}

function fileType(path: string, item: ItemSpec): string {
  if (item.fileType) return item.fileType
  if (path.startsWith('components/ui/')) return 'registry:ui'
  if (path.startsWith('components/')) return 'registry:component'
  if (/(^|\/)use-[^/]+\.tsx?$/.test(path)) return 'registry:hook'
  if (path.startsWith('app/') || path.startsWith('features/tools/')) {
    return item.type === 'registry:block' ? 'registry:block' : 'registry:component'
  }
  return 'registry:lib'
}

function packageVersions(): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return { ...manifest.dependencies, ...manifest.devDependencies }
}

/** The item that ships each source file. */
export function owners(items: readonly ItemSpec[] = ITEMS): Map<string, string> {
  const owner = new Map<string, string>()
  for (const item of items) for (const path of item.src ?? []) owner.set(path, item.name)
  return owner
}

function sorted(values: Iterable<string>): string[] | undefined {
  const list = [...values].sort()
  return list.length > 0 ? list : undefined
}

export function buildRegistry(items: readonly ItemSpec[] = ITEMS): {
  registry: Registry
  problems: string[]
} {
  const versions = packageVersions()
  const owner = owners(items)
  const problems: string[] = []

  for (const path of sourceFiles()) {
    if (!owner.has(path) && !UNSHIPPED.includes(path)) {
      problems.push(`src/${path} is shipped by no item; add it to one in items.ts`)
    }
  }

  const built = items.map((item): RegistryItem => {
    const dependencies = new Set<string>()
    const registryDependencies = new Set<string>()
    if (item.type === 'registry:ui') registryDependencies.add('tokens')
    for (const path of item.src ?? []) {
      if (!existsSync(join(SRC, path))) {
        problems.push(`${item.name}: src/${path} does not exist`)
        continue
      }
      for (const specifier of importsOf(path)) {
        const resolved = resolveImport(path, specifier)
        if (resolved === null) continue
        if (resolved.kind === 'package') {
          const version = versions[resolved.name]
          if (version) dependencies.add(`${resolved.name}@^${version.replace(/^[\^~]/, '')}`)
          else
            problems.push(`${item.name}: src/${path} imports ${resolved.name}, not in package.json`)
          continue
        }
        const from = owner.get(resolved.path)
        if (!from) problems.push(`${item.name}: src/${path} imports unshipped src/${resolved.path}`)
        else if (from !== item.name) registryDependencies.add(from)
      }
    }
    const files: RegistryFile[] = [
      ...(item.src ?? []).map((path) => ({
        path: `frontend/src/${path}`,
        type: fileType(path, item),
        target: target(path),
      })),
      ...(item.extraFiles ?? []),
    ]
    const packages = sorted(dependencies)
    const needs = sorted(registryDependencies)
    return {
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      ...(item.extends && { extends: item.extends }),
      ...(packages && (item.devOnly ? { devDependencies: packages } : { dependencies: packages })),
      ...(needs && { registryDependencies: needs.map((name) => `${REPO}/${name}`) }),
      files,
      categories: [...item.categories],
    }
  })

  return {
    registry: {
      $schema: 'https://ui.shadcn.com/schema/registry.json',
      name: 'devops-platform',
      homepage: `https://github.com/${REPO}`,
      items: built,
    },
    problems,
  }
}

export function serialize(registry: Registry): string {
  return `${JSON.stringify(registry, null, 2)}\n`
}

if (import.meta.main) {
  const { registry, problems } = buildRegistry()
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  writeFileSync(REGISTRY_PATH, serialize(registry))
  console.log(`registry.json: ${registry.items.length} items`)
}
