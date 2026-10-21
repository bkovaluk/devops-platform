/**
 * A control that changes something must be reachable by the view-as guard.
 *
 * The guard lives in `Button` (and so `IconButton`): a press, Enter or Space
 * is refused in the capture phase while a lens is on. It refuses what declares
 * `mutates` — or what a submit or a consequence variant already declares. A
 * mutation wired to a bare `<button>`, a menu item or a select is out of its
 * reach, and so is a neutral `Button` that forgot to declare itself.
 *
 * Handlers are read for verbs: a name made of words like `update`, `remove`,
 * `approve` is a mutation. Opening a sheet or a confirm is not.
 */
import { describe, expect, it } from 'vite-plus/test'
import { CONSEQUENCE_VARIANTS } from '@/components/ui/button-variants'
import { attribute, openingTags, read, sourceFiles } from '@/test/source-scan'

const SURFACES = ['src/app', 'src/components', 'src/features']

/** The primitives are where the guard lives. */
const NOT_SURFACES = ['src/components/ui']

const HANDLERS: Readonly<Record<string, readonly string[]>> = {
  button: ['onClick'],
  Button: ['onClick'],
  IconButton: ['onClick'],
  MenuItem: ['onSelect'],
  'Command.Item': ['onSelect'],
}

const VERBS = new Set([
  'mutate',
  'mutateAsync',
  'create',
  'update',
  'remove',
  'delete',
  'approve',
  'reject',
  'withdraw',
  'confirm',
  'submit',
  'save',
])

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
}

/** The functions a handler calls, or the one it names: `remove(key)`,
 *  `approve.mutate({ id })`, `onClick={confirm}`. A key in an object literal
 *  (`{ create: true }`) is data, not a call. */
function mutatingNames(expression: string): string[] {
  const code = expression.trim()
  const bare = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(code) ? [code] : []
  const called = [...code.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)].map(
    (m) => m[1] ?? '',
  )
  return [...bare, ...called].filter((name) => words(name).some((word) => VERBS.has(word)))
}

function declares(tag: string): boolean {
  if (/\bmutates\b/.test(tag)) return true
  if (/type="submit"/.test(tag)) return true
  const variant = attribute(tag, 'variant')
  if (variant === null) return false
  const spelled = [...variant.matchAll(/'([\w-]+)'/g)].map((m) => m[1] ?? '')
  const named = spelled.length > 0 ? spelled : [variant]
  return named.every((name) => CONSEQUENCE_VARIANTS.includes(name))
}

function unguardedIn(file: string, source: string): string[] {
  return openingTags(
    source,
    Object.keys(HANDLERS).map((name) => name.replace('.', '\\.')),
  ).flatMap((tag) =>
    (HANDLERS[tag.name] ?? []).flatMap((handler) => {
      const expression = attribute(tag.source, handler)
      if (expression === null) return []
      const verbs = mutatingNames(expression)
      if (verbs.length === 0) return []
      const guardable = tag.name === 'Button' || tag.name === 'IconButton'
      if (guardable && declares(tag.source)) return []
      const fix = guardable ? 'add `mutates`' : 'move it behind a Button with `mutates`'
      return [`${file}:${tag.line} <${tag.name}> ${handler} ${verbs.join(', ')} — ${fix}`]
    }),
  )
}

describe('controls that change something', () => {
  it('are all reachable by the read-only view-as guard', () => {
    const files = sourceFiles(SURFACES, { exclude: NOT_SURFACES }).filter((file) =>
      file.endsWith('.tsx'),
    )
    expect(files.flatMap((file) => unguardedIn(file, read(file)))).toEqual([])
  })

  it('are found by this check in the first place', () => {
    const bare = '<Button variant="soft" onClick={() => approve.mutate({ id })}>Approve</Button>'
    expect(unguardedIn('Probe.tsx', bare)).toHaveLength(1)
    const declared =
      '<Button variant="soft" mutates onClick={() => approve.mutate({ id })}>Approve</Button>'
    expect(unguardedIn('Probe.tsx', declared)).toEqual([])
    const item = '<MenuItem onSelect={() => remove(key)}>Delete</MenuItem>'
    expect(unguardedIn('Probe.tsx', item)).toHaveLength(1)
  })

  it('do not read a mutation into a name that only opens something', () => {
    expect(mutatingNames('() => setDeleting(true)')).toEqual([])
    expect(mutatingNames('() => setEditing(true)')).toEqual([])
    expect(mutatingNames('() => withdraw.mutate({ id })')).toEqual(['withdraw.mutate'])
    expect(mutatingNames('() => setSearch({ create: true })')).toEqual([])
    expect(mutatingNames('confirm')).toEqual(['confirm'])
  })
})
