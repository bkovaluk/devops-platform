/**
 * Hands openapi-typescript the TypeScript 5 compiler API it is built on.
 *
 * The repo type-checks with TypeScript 7, which has no JavaScript compiler
 * API; `typescript5` is TypeScript 5.9 under an npm alias. Preloaded with
 * `node --import`, this resolves openapi-typescript's `typescript` imports to
 * it and leaves every other import alone.
 *
 *   node --import ./scripts/api-types/typescript5.ts node_modules/openapi-typescript/bin/cli.js …
 */
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'typescript' && context.parentURL?.includes('/openapi-typescript/')) {
      return nextResolve('typescript5', context)
    }
    return nextResolve(specifier, context)
  },
})
