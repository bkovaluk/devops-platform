/**
 * Reading the repo's own source, for the tests that hold the design standards.
 * Each standard is a scan: list the files, find the shape, expect none.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface ScanOptions {
  /** Paths (files or directories) left out, relative to the frontend root. */
  exclude?: readonly string[]
  /** Include `*.test.*` and `*.stories.*` files. */
  includeTests?: boolean
  extensions?: RegExp
}

export function sourceFiles(roots: readonly string[], options: ScanOptions = {}): string[] {
  const { exclude = [], includeTests = false, extensions = /\.tsx?$/ } = options
  const walk = (path: string): string[] => {
    if (exclude.includes(path)) return []
    if (statSync(path).isDirectory())
      return readdirSync(path).flatMap((entry) => walk(join(path, entry)))
    if (!extensions.test(path)) return []
    if (!includeTests && /\.(test|stories)\.tsx?$/.test(path)) return []
    return [path]
  }
  return roots.flatMap(walk)
}

export function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Every line of every file matching `pattern`, as `file:line text`. */
export function linesMatching(files: readonly string[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    read(file)
      .split('\n')
      .flatMap((line, index) =>
        pattern.test(line) ? [`${file}:${index + 1} ${line.trim()}`] : [],
      ),
  )
}

export interface Tag {
  name: string
  source: string
  line: number
}

/** The opening JSX tags named `names`, braces balanced, each with its line. */
export function openingTags(source: string, names: readonly string[]): Tag[] {
  const tags: Tag[] = []
  const opener = new RegExp(`<(${names.join('|')})(?=[\\s/>])`, 'g')
  let match: RegExpExecArray | null = opener.exec(source)
  while (match !== null) {
    let depth = 0
    let end = opener.lastIndex
    for (; end < source.length; end += 1) {
      const char = source[end]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      else if (char === '>' && depth === 0) break
    }
    tags.push({
      name: match[1] ?? '',
      source: source.slice(match.index, end + 1),
      line: source.slice(0, match.index).split('\n').length,
    })
    match = opener.exec(source)
  }
  return tags
}

/**
 * An attribute's value as written — the expression inside braces, or the
 * string — taken from the tag itself, never from a JSX value nested in
 * another attribute (`icon={<X className="…" />}`).
 */
export function attribute(tag: string, name: string): string | null {
  let depth = 0
  for (let i = 0; i < tag.length; i += 1) {
    const char = tag[i]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    if (depth !== 0 || !/\s/.test(char ?? '') || !tag.startsWith(`${name}=`, i + 1)) continue
    const valueStart = i + name.length + 2
    if (tag[valueStart] === '"') {
      const end = tag.indexOf('"', valueStart + 1)
      return tag.slice(valueStart + 1, end)
    }
    if (tag[valueStart] !== '{') return null
    let inner = 1
    let end = valueStart + 1
    for (; end < tag.length && inner > 0; end += 1) {
      if (tag[end] === '{') inner += 1
      else if (tag[end] === '}') inner -= 1
    }
    return tag.slice(valueStart + 1, end - 1)
  }
  return null
}
