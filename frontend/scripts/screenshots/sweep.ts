/// <reference lib="dom" />
/**
 * Screenshots of the console in MSW mode, and a sweep that fails on console
 * errors and horizontal overflow.
 *
 * Three passes, every one in both themes:
 *   - scenes: the reference screens at 1440 (`<scene>-<theme>.png`), the
 *     approval sheet, the inbox and the assistant among them;
 *   - sweep: every page at each width (`sweep/<width>/<page>-<theme>.png`),
 *     checked for overflow past the viewport;
 *   - principals: the pages as `?as=viewer|reviewer|empty` and with
 *     `?assistant=off` (`principals/<case>-<page>-<theme>.png`).
 *
 * It starts its own dev server with `VITE_USE_MSW=true` and stops it by PID,
 * or uses one already running when `BASE` is set.
 *
 *   bunx playwright install chromium     # once: the browser this Playwright drives
 *   bun run screenshots                  # writes to ./screenshots
 *   OUT=../docs/screens bun run screenshots
 *
 * Environment: `BASE` (a running server), `PORT` (default 5199), `OUT`,
 * `WIDTHS` (default 1440,1024,820,390), `THEMES` (default dark,light),
 * `PASSES` (default scenes,sweep,principals).
 * Exits 1 when any page logged an error or overflowed.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type Browser, type Page, chromium } from 'playwright'

const FRONTEND = join(import.meta.dirname, '..', '..')
const PORT = Number(process.env.PORT ?? 5199)
const OUT = resolve(FRONTEND, process.env.OUT ?? 'screenshots')
const WIDTHS = (process.env.WIDTHS ?? '1440,1024,820,390').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'dark,light').split(',') as Theme[]
const PASSES = (process.env.PASSES ?? 'scenes,sweep,principals').split(',')
const SCENE_WIDTH = 1440
const HEIGHT = 900
const SETTLE_MS = 800
const SERVER_TIMEOUT_MS = 60_000
const AGENT_TIMEOUT_MS = 20_000

type Theme = 'dark' | 'light'

const PAGES: ReadonlyArray<readonly [name: string, path: string]> = [
  ['home', '/'],
  ['flags-all', '/flags?env=all'],
  ['flags-dev', '/flags?env=dev'],
  ['flag-detail', '/flags/staging/checkout-v2'],
  ['flag-edit', '/flags/staging/checkout-v2?edit=true'],
  ['flag-create', '/flags?env=all&create=true'],
  ['approvals', '/approvals'],
  ['approvals-all', '/approvals?status=all'],
  ['investigations', '/investigations'],
  ['investigation-detail', '/investigations/prod/f-checkout-0001'],
  ['investigation-close', '/investigations/prod/f-checkout-0001?close=wrong'],
  ['not-found', '/nope'],
]

const PRINCIPAL_CASES: ReadonlyArray<readonly [name: string, query: string]> = [
  ['viewer', 'as=viewer'],
  ['reviewer', 'as=reviewer'],
  ['empty', 'as=empty'],
  ['assistant-off', 'as=admin&assistant=off'],
]

interface Scene {
  name: string
  principal: string
  path: string
  act?: (page: Page) => Promise<void>
}

const SCENES: Scene[] = [
  { name: 'home', principal: 'admin', path: '/' },
  { name: 'flags-list-all-envs', principal: 'admin', path: '/flags?env=all' },
  {
    name: 'flag-detail-minute-popover',
    principal: 'admin',
    path: '/flags/staging/checkout-v2',
    act: async (page) => {
      const strip = page.getByRole('group', { name: /Evaluations of checkout-v2 in staging/ })
      await strip.getByRole('button').nth(37).click()
    },
  },
  {
    name: 'flag-edit-staging-approval',
    principal: 'admin',
    path: '/flags/staging/checkout-v2?edit=true',
    act: async (page) => {
      await page.getByRole('button', { name: 'Request approval for staging' }).waitFor()
      await page.getByRole('textbox', { name: 'Rollout percent' }).fill('75')
      await page.getByRole('heading', { name: 'Edit checkout-v2' }).click()
    },
  },
  {
    name: 'approvals-inbox',
    principal: 'admin',
    path: '/approvals',
    act: async (page) => {
      await page.getByRole('button', { name: /Update flag checkout-v2 in prod/ }).click()
    },
  },
  {
    name: 'investigation-detail',
    principal: 'admin',
    path: '/investigations/prod/f-checkout-0001',
  },
  {
    name: 'investigation-hypothesis-focus',
    principal: 'admin',
    path: '/investigations/prod/f-orders-0001',
    act: async (page) => {
      const hypotheses = page.getByRole('list', { name: 'Hypotheses' })
      await hypotheses.getByRole('button').first().click()
      await page.getByRole('list', { name: 'Notebook' }).scrollIntoViewIfNeeded()
    },
  },
  {
    name: 'env-breadcrumb-menu',
    principal: 'admin',
    path: '/investigations?env=prod',
    act: async (page) => {
      await page.getByRole('button', { name: /^Environment:/ }).click()
    },
  },
]

const problems: string[] = []

function url(base: string, path: string, query: string): string {
  return `${base}${path}${path.includes('?') ? '&' : '?'}msw=1&${query}`
}

async function openPage(browser: Browser, theme: Theme, width: number, label: string) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT } })
  await context.addInitScript((value) => {
    localStorage.setItem(
      'platform-ui',
      JSON.stringify({ state: { theme: value, sidebarCollapsed: false }, version: 0 }),
    )
  }, theme)
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${label}: console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`${label}: page error: ${error.message}`))
  return page
}

async function visit(page: Page, target: string) {
  await page.goto(target, { waitUntil: 'networkidle' })
  await page.waitForTimeout(SETTLE_MS)
}

/** Elements that reach past the viewport, outside any container that scrolls
 *  sideways on purpose. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    const found: string[] = []
    if (document.documentElement.scrollWidth > viewport) {
      found.push(`document is ${document.documentElement.scrollWidth}px wide`)
    }
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect()
      if (!box.width || !box.height || box.right <= viewport + 0.5) continue
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.position === 'fixed') continue
      let ancestor = element.parentElement
      let scrolls = false
      while (ancestor && !scrolls) {
        const { overflowX } = getComputedStyle(ancestor)
        scrolls =
          (overflowX === 'auto' || overflowX === 'scroll') &&
          ancestor.scrollWidth > ancestor.clientWidth
        ancestor = ancestor.parentElement
      }
      if (scrolls) continue
      const text = (element.textContent ?? '').trim().slice(0, 40)
      found.push(`<${element.tagName.toLowerCase()}> ends at ${Math.round(box.right)}px "${text}"`)
    }
    return found.slice(0, 10)
  })
}

async function scenes(browser: Browser, base: string) {
  mkdirSync(OUT, { recursive: true })
  for (const theme of THEMES) {
    for (const scene of SCENES) {
      const page = await openPage(browser, theme, SCENE_WIDTH, `scene ${scene.name} ${theme}`)
      await visit(page, url(base, scene.path, `as=${scene.principal}`))
      if (scene.act) {
        await scene.act(page)
        await page.waitForTimeout(SETTLE_MS)
      }
      await page.screenshot({ path: join(OUT, `${scene.name}-${theme}.png`) })
      await page.context().close()
    }
    await assistantScenes(browser, base, theme)
  }
}

/** The dock as the editor: a read answered, a write proposed in staging, the
 *  proposal confirmed into an approval request. */
async function assistantScenes(browser: Browser, base: string, theme: Theme) {
  const page = await openPage(browser, theme, SCENE_WIDTH, `scene assistant ${theme}`)
  await visit(page, url(base, '/flags?env=staging', 'as=editor'))
  await page.getByRole('button', { name: 'Open assistant' }).click()
  const dock = page.getByRole('complementary', { name: 'Assistant' })
  const field = dock.getByRole('textbox', { name: 'Message the assistant' })
  const idle = () =>
    dock
      .getByRole('button', { name: 'Stop' })
      .waitFor({ state: 'detached', timeout: AGENT_TIMEOUT_MS })
  const ask = async (text: string, answer: RegExp) => {
    await field.fill(text)
    await field.press('Enter')
    await dock.getByText(answer).waitFor({ timeout: AGENT_TIMEOUT_MS })
    await idle()
  }

  await ask('Which flags are rolling out in staging?', /Rolling out/)
  await ask('What about checkout-v2 in prod?', /owned by/)
  const read = dock.getByRole('button', { name: /^list_flags in staging/ })
  await read.click()
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: join(OUT, `assistant-answer-${theme}.png`) })
  await read.click()

  await field.fill('Set checkout-v2 to 75% in staging')
  await field.press('Enter')
  const confirm = dock.getByRole('button', { name: 'Request approval for staging' })
  await confirm.waitFor({ timeout: AGENT_TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: join(OUT, `assistant-interrupt-staging-${theme}.png`) })

  await confirm.click()
  await dock.getByText(/Filed request/).waitFor({ timeout: AGENT_TIMEOUT_MS })
  await idle()
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: join(OUT, `assistant-confirmed-${theme}.png`) })
  await page.context().close()
}

async function sweep(browser: Browser, base: string) {
  for (const width of WIDTHS) {
    const dir = join(OUT, 'sweep', String(width))
    mkdirSync(dir, { recursive: true })
    for (const theme of THEMES) {
      const page = await openPage(browser, theme, width, `sweep ${width} ${theme}`)
      for (const [name, path] of PAGES) {
        await visit(page, url(base, path, 'as=admin'))
        for (const found of await overflow(page)) problems.push(`[${width}] ${path}: ${found}`)
        await page.screenshot({ path: join(dir, `${name}-${theme}.png`) })
      }
      await page.context().close()
    }
  }
}

async function principals(browser: Browser, base: string) {
  const dir = join(OUT, 'principals')
  mkdirSync(dir, { recursive: true })
  for (const theme of THEMES) {
    for (const [name, query] of PRINCIPAL_CASES) {
      const page = await openPage(browser, theme, SCENE_WIDTH, `principal ${name} ${theme}`)
      for (const [pageName, path] of PAGES) {
        await visit(page, url(base, path, query))
        for (const found of await overflow(page)) problems.push(`[${name}] ${path}: ${found}`)
        await page.screenshot({ path: join(dir, `${name}-${pageName}-${theme}.png`) })
      }
      await page.context().close()
    }
  }
}

/** The server runs in its own process group: stop the group by its PID. */
function stopServer(server: ChildProcess) {
  if (server.pid) process.kill(-server.pid, 'SIGTERM')
}

async function startServer(): Promise<{ base: string; server: ChildProcess }> {
  const server = spawn(
    join(FRONTEND, 'node_modules', '.bin', 'vp'),
    ['dev', '--port', String(PORT), '--strictPort'],
    {
      cwd: FRONTEND,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, VITE_USE_MSW: 'true' },
    },
  )
  const base = `http://localhost:${PORT}`
  const deadline = Date.now() + SERVER_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      if ((await fetch(base)).ok) return { base, server }
    } catch {
      await new Promise((done) => setTimeout(done, 250))
    }
  }
  stopServer(server)
  throw new Error(`The dev server did not answer on ${base} within ${SERVER_TIMEOUT_MS / 1000}s.`)
}

const started = process.env.BASE ? null : await startServer()
const base = process.env.BASE ?? started?.base ?? ''
const browser = await chromium.launch()
try {
  if (PASSES.includes('scenes')) await scenes(browser, base)
  if (PASSES.includes('sweep')) await sweep(browser, base)
  if (PASSES.includes('principals')) await principals(browser, base)
} finally {
  await browser.close()
  if (started) stopServer(started.server)
}

console.log(`Screenshots in ${OUT}`)
if (problems.length) {
  console.log(`${problems.length} problems:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('No console errors, no overflow.')
