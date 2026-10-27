/**
 * The shareable URL of anything the app can link to.
 *
 * `ResourceLink` is the typed vocabulary: a new linkable resource extends the
 * union and the builder below, and `resource-links.test.ts` checks every link
 * against the router, so a URL nobody can open fails the suite.
 */
export type ResourceLink =
  | { kind: 'flag'; key: string; env: string }
  | { kind: 'flags'; env: string }
  | { kind: 'approval'; id: string }
  | { kind: 'finding'; id: string; env: string }
  | { kind: 'findings'; env: string }

/** The path and search a link opens, relative to the app's origin. */
export function resourcePath(resource: ResourceLink): string {
  switch (resource.kind) {
    case 'flag':
      return `/flags/${encodeURIComponent(resource.env)}/${encodeURIComponent(resource.key)}`
    case 'flags':
      return `/flags?env=${encodeURIComponent(resource.env)}`
    case 'approval':
      return `/approvals?status=all&id=${encodeURIComponent(resource.id)}`
    case 'finding':
      return `/investigations/${encodeURIComponent(resource.env)}/${encodeURIComponent(resource.id)}`
    case 'findings':
      return `/investigations?env=${encodeURIComponent(resource.env)}`
  }
}

export function buildResourceLink(resource: ResourceLink, origin = window.location.origin): string {
  return `${origin}${resourcePath(resource)}`
}
