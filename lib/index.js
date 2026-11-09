/**
 * Host half of dsh-prompt-boost.
 *
 * Two jobs, both mounted from ONE Loader entry:
 *
 * 1. Own the settings surface — which model performs the enhancement, plus a
 *    small tuning set — persisted as JSON under the DSH home.
 * 2. Serve the enhancement call itself as a loopback-fenced route, and list the
 *    models the user may choose from.
 *
 * ## Why this file imports no packages
 *
 * The package is installed from a local directory (a linked bundle), so Node
 * resolves its bare specifiers from that directory's own ancestors — NOT from
 * the profile's `node_modules`. `@deepseek-ai/schemastery` and
 * `@deepseek-ai/dsh-llm` are therefore unreachable here even though the
 * installed first-party plugins can see them. One `import z from
 * '@deepseek-ai/schemastery'` would throw `ERR_MODULE_NOT_FOUND` while the
 * Loader evaluates this module, which fails the entry and takes the entire web
 * boot down with it.
 *
 * Only `node:` builtins are imported, which always resolve. The consequences are
 * deliberate:
 *
 * - No `Config` export. A schemastery schema cannot be built without the import,
 *   so settings are declared and validated by hand (see {@link readSettings}),
 *   and the Settings *page* is drawn by the browser half rather than generated
 *   from a schema. That suits this plugin better anyway: the model picker needs
 *   a live dropdown, which a schema-generated text field cannot express.
 * - No `settings` service. `settings.describe()` projects *Config schemas*, so a
 *   package without one may not appear there at all — writing through it would
 *   be a runtime dependency on an implementation detail this package cannot
 *   declare. A private JSON file is the honest store: it is this plugin's own
 *   preference, not harness configuration.
 * - No `BlockAssembler` / `createUserMessage`. `llm.stream` accepts a plain
 *   `{ role: 'user', content: [{ type: 'text', text }] }` request message and the
 *   text arrives on `text-delta` chunks, so the enhancement reads the stream
 *   directly.
 *
 * ## Failure policy
 *
 * `apply` must never throw: the web boot treats a throw from any entry as fatal.
 * Nothing is declared in `inject` either — an unsatisfied dependency would leave
 * the entry pending, which DSH also reports as a failed boot. Every service is
 * reached through `ctx.get` at the moment it is needed, and every optional
 * wiring step is wrapped, logged, and degrades instead of propagating.
 *
 * @module dsh-prompt-boost
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Stable Cordis plugin name; must equal the package name the Loader resolves. */
export const name = '@amyaxy/dsh-prompt-boost'

/**
 * No hard dependencies.
 *
 * Deliberately empty: every service this plugin needs is reached through
 * `ctx.get` at use time. An `inject` entry that is never satisfied keeps the
 * Loader entry pending, and DSH reports that as a failed web boot — far worse
 * than a feature that is temporarily unavailable.
 */
export const inject = []

/** Route prefix this package's Host routes live under. */
const ROUTE_PREFIX = '/plugins/dsh-prompt-boost'

/**
 * Defaults, mirrored verbatim in the browser half.
 *
 * Keep this object and `DEFAULTS` in `lib/client.js` in step: the browser
 * renders its first frame before the host answers, and a drifting default would
 * make the form flicker to different values a moment later.
 */
const DEFAULT_SETTINGS = {
  enabled: true,
  /** Provider route; empty means "follow the harness default model". */
  provider: '',
  /** Model id; empty means "follow the harness default model". */
  model: '',
  temperature: 0.3,
  maxOutputTokens: 4096,
  timeoutMs: 60000,
  /** Empty means the built-in enhancement strategy. */
  systemPrompt: '',
}

/** Field order used when reporting and writing; also the only writable keys. */
const WRITABLE = ['enabled', 'provider', 'model', 'temperature', 'maxOutputTokens', 'timeoutMs', 'systemPrompt']

/**
 * The built-in enhancement strategy.
 *
 * Phrased as constraints on the *rewrite* rather than as a persona: the model's
 * job is to return the user's own text made precise, not to answer it. Each rule
 * exists because dropping it produces a recognisably wrong result — an answer
 * instead of a prompt, a preamble, invented requirements, or a mangled code
 * block.
 */
const SYSTEM_PROMPT = [
  'You rewrite a draft message that a user is about to send to a coding assistant.',
  '',
  'Your output is used verbatim as the new draft. Return ONLY the rewritten draft.',
  '',
  'Rules:',
  "1. Preserve the author's intent, language, and point of view. If the draft is in Chinese, answer in Chinese; if it is in English, answer in English.",
  '2. Preserve every concrete detail: names, paths, identifiers, numbers, versions, error text, and code. Never invent a requirement, a constraint, or a fact that the draft does not contain.',
  '3. Make the ask explicit and self-contained: state what should be done, and keep the context a reader needs to act on it.',
  '4. Keep fenced code blocks, inline code, and command lines byte-for-byte intact.',
  '5. Do not answer the request, do not explain your changes, and do not add a preface, a summary, or quotation marks around the result.',
  "6. Match the draft's scale. A one-line draft stays short; do not pad it into an essay.",
  '7. If the draft is already clear and well-formed, return it unchanged rather than rewriting for the sake of it.',
].join('\n')

/** A shallow copy of the defaults, so callers cannot mutate the constant. */
function defaultSettings() {
  return { ...DEFAULT_SETTINGS }
}

/**
 * Coerce one stored section into a complete, validated settings object.
 *
 * The store is user-editable JSON on disk and may predate the current build, so
 * every field is checked against its own invariant instead of being trusted.
 * Unknown keys are dropped: only the fields named here survive a round-trip,
 * which keeps a hand-edited file from persisting junk.
 *
 * @param raw - the untrusted stored value.
 * @returns a complete settings object; never throws.
 */
function readSettings(raw) {
  const settings = defaultSettings()
  if (raw === null || typeof raw !== 'object') return settings
  const record = raw

  if (typeof record.enabled === 'boolean') settings.enabled = record.enabled

  // Route strings are trimmed: a stray space in a model id becomes a provider
  // error with an opaque message instead of a usable one.
  if (typeof record.provider === 'string') settings.provider = record.provider.trim()
  if (typeof record.model === 'string') settings.model = record.model.trim()

  // `Number.isFinite` rejects NaN and Infinity, both of which a hand-edited file
  // can express and both of which would reach the adapter as-is.
  if (Number.isFinite(record.temperature)) {
    settings.temperature = Math.min(1, Math.max(0, record.temperature))
  }
  if (Number.isFinite(record.maxOutputTokens)) {
    settings.maxOutputTokens = Math.min(32768, Math.max(256, Math.trunc(record.maxOutputTokens)))
  }
  if (Number.isFinite(record.timeoutMs)) {
    settings.timeoutMs = Math.min(600000, Math.max(5000, Math.trunc(record.timeoutMs)))
  }
  if (typeof record.systemPrompt === 'string') settings.systemPrompt = record.systemPrompt

  return settings
}

/**
 * Report one failed optional step and keep going.
 *
 * A silent catch would make "the button is missing" undebuggable, so each
 * failure logs exactly one bounded line.
 *
 * @param step - the wiring step that failed, named as the user sees it.
 * @param error - the thrown value.
 * @returns a no-op disposer, so callers stay uniform.
 */
function report(step, error) {
  try {
    console.warn(`[prompt-boost] ${step} failed; that feature stays off.`, error)
  } catch {
    // A throwing console must not turn a degraded feature into a failed boot.
  }
  return () => {}
}

/* --------------------------------------------------------------------------
 * Settings store.
 *
 * One JSON file under the DSH home. Writes are serialized and atomic (temp file
 * plus rename) so a crash mid-write cannot leave the preference file truncated,
 * and two concurrent saves cannot interleave into a corrupt document.
 * ------------------------------------------------------------------ */

/** Absolute path of the settings file. */
function storePath() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'prompt-boost', 'settings.json')
}

/**
 * In-memory fallback, used when the settings file cannot be read or written.
 *
 * A read-only or relocated home must not break the plugin: the user can still
 * enhance with the harness default model, and the choice simply does not persist
 * beyond the process.
 */
let memorySettings = defaultSettings()

/** Tail of the write chain; keeps saves strictly ordered. */
let writeChain = Promise.resolve()

/** Read the current settings from disk, falling back to memory. */
async function loadSettings() {
  try {
    const text = await readFile(storePath(), 'utf8')
    const parsed = JSON.parse(text)
    memorySettings = readSettings(parsed)
    return memorySettings
  } catch (error) {
    // A missing file is the first-run case, not a problem worth reporting.
    if (error?.code !== 'ENOENT') report('reading the settings file', error)
    return memorySettings
  }
}

/**
 * Merge one patch into the stored settings and persist it.
 *
 * `mutate`-style merge rather than overwrite: a patch that names one field must
 * not silently reset the others.
 *
 * @param patch - the fields to change.
 * @returns the settings as stored after the write.
 */
async function saveSettings(patch) {
  const write = async () => {
    const current = await loadSettings()
    const merged = { ...current }
    for (const key of WRITABLE) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) merged[key] = patch[key]
    }
    // Re-validate the merged document so the file on disk is always a value the
    // loader would accept even if a caller sent nonsense.
    const next = readSettings(merged)
    memorySettings = next
    const target = storePath()
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
    try {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      // Rename is atomic within one filesystem, so readers never observe a
      // half-written document.
      await rename(temporary, target)
    } catch (error) {
      report('writing the settings file', error)
    }
    return next
  }

  const queued = writeChain.then(write, write)
  // Keep the chain alive even when this write rejected, so one failure cannot
  // stall every later save.
  writeChain = queued.then(() => undefined, () => undefined)
  return queued
}

/* --------------------------------------------------------------------------
 * Transport helpers.
 * ------------------------------------------------------------------ */

/**
 * Read one request body to completion, with a hard byte cap.
 *
 * The cap is enforced while collecting rather than afterwards: without it a
 * local caller could make the host buffer an unbounded string.
 *
 * @param req - the incoming request.
 * @param limit - maximum accepted bytes.
 * @returns the decoded body.
 * @throws when the body exceeds `limit`.
 */
async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error(`request body exceeds ${limit} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Send one JSON response. */
function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Narrow one thrown value to a printable message. */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** @param value - candidate. @returns whether it is a non-empty string. */
function isText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/* --------------------------------------------------------------------------
 * Model directory.
 * ------------------------------------------------------------------ */

/**
 * Collect every model the user may choose, grouped by provider.
 *
 * Both `listProviders()` (routes that are live now) and
 * `listConfigurableProviders()` (routes an adapter could activate) are merged:
 * the picker must be able to express a model whose provider is currently dormant,
 * otherwise a user cannot pre-select the route they are about to configure.
 *
 * @param ctx - the plugin context.
 * @returns the provider directory; failures degrade to an empty list.
 */
async function listModelDirectory(ctx) {
  const llm = ctx.get('llm')
  if (llm === undefined) return []

  /** @type {Map<string, { provider: string, name: string, models: object[] }>} */
  const byProvider = new Map()

  /** Merge one provider into the directory. */
  const addProvider = (id, label) => {
    if (!isText(id)) return
    const key = id.trim()
    const existing = byProvider.get(key)
    if (existing !== undefined) {
      if (!isText(existing.name) && isText(label)) existing.name = label.trim()
      return
    }
    byProvider.set(key, { provider: key, name: isText(label) ? label.trim() : key, models: [] })
  }

  try {
    if (typeof llm.listProviders === 'function') {
      const live = await llm.listProviders()
      if (Array.isArray(live)) for (const entry of live) addProvider(entry?.id, entry?.name)
    }
  } catch (error) {
    report('listing live model providers', error)
  }

  try {
    if (typeof llm.listConfigurableProviders === 'function') {
      const dormant = await llm.listConfigurableProviders()
      if (Array.isArray(dormant)) for (const entry of dormant) addProvider(entry?.id, entry?.name)
    }
  } catch (error) {
    report('listing configurable model providers', error)
  }

  // Fetched per provider so one unreachable provider cannot blank the whole
  // picker: its failure only leaves that provider's list empty.
  const providers = Array.from(byProvider.values())
  await Promise.all(providers.map(async (entry) => {
    try {
      const models = await llm.listModels(entry.provider)
      if (!Array.isArray(models)) return
      const seen = new Set()
      for (const model of models) {
        if (!isText(model?.id)) continue
        const id = model.id.trim()
        if (seen.has(id)) continue
        seen.add(id)
        entry.models.push({
          id,
          name: isText(model?.name) ? model.name.trim() : id,
          ...(isText(model?.description) ? { description: model.description.trim() } : {}),
        })
      }
    } catch {
      // A provider that is not configured yet answers with a rejection; an empty
      // model list is the honest rendering of that.
    }
  }))

  return providers
    .filter((entry) => entry.models.length > 0)
    .sort((a, b) => a.provider.localeCompare(b.provider))
}

/**
 * The harness default route, used when the user has not picked a model.
 *
 * Read through `ctx.get` rather than declared as a dependency: a profile without
 * the service still gets a working plugin as long as the settings name an
 * explicit pair.
 *
 * @param ctx - the plugin context.
 * @returns the default route, or undefined.
 */
function defaultRoute(ctx) {
  try {
    const service = ctx.get('agentDefaultModel')
    if (service === undefined || typeof service.currentSelection !== 'function') return undefined
    const selection = service.currentSelection()
    if (selection === null || typeof selection !== 'object') return undefined
    const provider = typeof selection.provider === 'string' ? selection.provider.trim() : ''
    const model = typeof selection.model === 'string' ? selection.model.trim() : ''
    if (provider === '' || model === '') return undefined
    return { provider, model }
  } catch {
    return undefined
  }
}

/**
 * Resolve the route one enhancement should use.
 *
 * Precedence, highest first:
 * 1. The pair saved on this plugin's settings page — the explicit user choice,
 *    and the whole point of this plugin.
 * 2. The harness default model.
 *
 * @param configured - the live settings.
 * @param fallback - the harness default route, if any.
 * @returns the chosen route, or undefined when nothing is usable.
 */
function resolveRoute(configured, fallback) {
  if (isText(configured.provider) && isText(configured.model)) {
    return { provider: configured.provider, model: configured.model, source: 'settings' }
  }
  if (fallback !== undefined) return { ...fallback, source: 'default' }
  return undefined
}

/* --------------------------------------------------------------------------
 * Enhancement.
 * ------------------------------------------------------------------ */

/**
 * Run one enhancement call to completion.
 *
 * A plain request message is used (no `createUserMessage`): `llm.stream` accepts
 * `{ role: 'user', content }` for one-shot callers, which is exactly what this is.
 *
 * @param ctx - the plugin context.
 * @param options - the resolved call.
 * @returns the raw rewritten text.
 */
async function runEnhancement(ctx, options) {
  const { route, settings, text } = options
  const llm = ctx.get('llm')
  if (llm === undefined || typeof llm.stream !== 'function') throw new Error('no model registry is available')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs)
  // Race the iteration against the deadline: an adapter that stalls without
  // yielding a chunk would otherwise hold the request open forever, and the
  // abort only helps if something is awaiting it.
  const expired = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('enhancement timed out')), { once: true })
  })

  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      system: isText(settings.systemPrompt) ? settings.systemPrompt : SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      temperature: settings.temperature,
      maxTokens: settings.maxOutputTokens,
      signal: controller.signal,
    })

    const iterator = stream[Symbol.asyncIterator]()
    let out = ''
    // Tracked so an empty answer can explain itself. A reasoning model that
    // spends its whole output budget thinking emits no text at all, and
    // "the model returned no text" would otherwise be the only clue.
    let reasoningChars = 0
    let finishKind = ''
    let failure = ''
    while (true) {
      const next = await Promise.race([iterator.next(), expired])
      if (next.done) break
      const chunk = next.value
      if (chunk === null || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta') {
        if (typeof chunk.text === 'string') out += chunk.text
      } else if (chunk.type === 'reasoning-delta') {
        if (typeof chunk.text === 'string') reasoningChars += chunk.text.length
      } else if (chunk.type === 'finish') {
        // The last finish reason is authoritative; adapters may also report a
        // failure here instead of throwing.
        const reason = chunk.reason
        if (reason !== null && typeof reason === 'object') {
          if (typeof reason.kind === 'string') finishKind = reason.kind
          const detail = reason.failure
          if (detail !== null && typeof detail === 'object') {
            failure = typeof detail.message === 'string' && detail.message !== ''
              ? detail.message
              : typeof detail.code === 'string' ? detail.code : ''
          }
        }
      }
    }

    const trimmed = out.trim()
    if (trimmed !== '') return trimmed

    // An explicit adapter failure is the most useful thing to surface.
    if (failure !== '') throw new Error(failure)
    if (finishKind === 'aborted') throw new Error('the model request was aborted')
    if (finishKind === 'max-tokens' && reasoningChars > 0) {
      throw new Error(
        `the model used its whole ${settings.maxOutputTokens}-token output budget on reasoning without writing an answer; raise the output limit or choose a non-reasoning model`,
      )
    }
    if (finishKind === 'max-tokens') {
      throw new Error(`the model hit the ${settings.maxOutputTokens}-token output limit before writing an answer; raise the output limit`)
    }
    if (finishKind === 'tool-calls') {
      throw new Error('the model tried to call a tool instead of rewriting the text; choose a plain-chat model')
    }
    if (reasoningChars > 0) {
      throw new Error('the model returned only reasoning and no answer; choose a non-reasoning model')
    }
    throw new Error('the model returned no text')
  } finally {
    clearTimeout(timer)
    // Stop the adapter's work even on the success path so an abandoned stream
    // cannot keep consuming quota.
    try { controller.abort() } catch { /* already settled */ }
  }
}

/**
 * Strip a markdown fence wrapping the WHOLE answer.
 *
 * Only a fence around the entire output is removed; interior blocks are the
 * user's own code and must survive untouched.
 *
 * @param text - the raw model output.
 * @returns the unwrapped text.
 */
function unwrapFence(text) {
  const match = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(text.trim())
  return match === null ? text.trim() : match[1].trim()
}

/* --------------------------------------------------------------------------
 * Loopback fence.
 *
 * The enhancement route spends the user's model quota, so it must only answer
 * this machine's own app page.
 * ------------------------------------------------------------------ */

/** Whether the socket peer is this machine. */
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Full trust check for this package's routes.
 *
 * - the socket peer must be loopback;
 * - a `Host` header naming a foreign host is refused, which defeats DNS
 *   rebinding (the socket stays loopback while the hostname is not);
 * - any proxy-forwarding header is refused (a proxy is outside this trust model);
 * - a browser-supplied `Origin` must be a loopback page on the very port the
 *   request was addressed to, so another local server cannot spend the quota.
 */
function isTrustedRequest(req) {
  if (req.headers['x-forwarded-for'] !== undefined || req.headers.forwarded !== undefined) return false
  if (!isLoopbackRequest(req)) return false

  const host = req.headers.host
  if (typeof host !== 'string' || host.trim() === '') return true

  let hostUrl
  try {
    hostUrl = new URL(`http://${host.trim()}`)
  } catch {
    return false
  }
  const bare = hostUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (bare !== 'localhost' && bare !== '127.0.0.1' && bare !== '::1') return false

  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin.trim() === '') return true
  try {
    const originUrl = new URL(origin)
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false
    const originHost = originUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (originHost !== 'localhost' && originHost !== '127.0.0.1' && originHost !== '::1') return false
    // Compare effective ports, filling in the scheme default: the page on 58457
    // must not be reachable from a different local server's origin.
    const expected = hostUrl.port === '' ? '80' : hostUrl.port
    const actual = originUrl.port === '' ? (originUrl.protocol === 'https:' ? '443' : '80') : originUrl.port
    return expected === actual
  } catch {
    return false
  }
}

/* --------------------------------------------------------------------------
 * Routes.
 * ------------------------------------------------------------------ */

/**
 * Dispatch one request on this package's prefix.
 *
 * @param ctx - the plugin context.
 * @param req - the request.
 * @param res - the response.
 */
async function serve(ctx, req, res) {
  try {
    if (!isTrustedRequest(req)) return json(res, 403, { error: 'forbidden' })

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith(ROUTE_PREFIX)) return json(res, 404, { error: 'unknown action' })
    const action = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '')

    if (action === 'state' && req.method === 'GET') {
      const settings = await loadSettings()
      return json(res, 200, {
        settings,
        defaults: DEFAULT_SETTINGS,
        store: storePath(),
        writable: WRITABLE,
        available: ctx.get('llm') !== undefined,
      })
    }

    if (action === 'models' && req.method === 'GET') {
      const providers = await listModelDirectory(ctx)
      return json(res, 200, { providers, default: defaultRoute(ctx) ?? null })
    }

    if (action === 'save' && req.method === 'POST') {
      const body = await readBody(req, 64 * 1024)
      const parsed = JSON.parse(body === '' ? '{}' : body)
      const patch = {}
      // Only known keys are forwarded, and `readSettings` re-validates on the way
      // back out, so a malformed body cannot poison the stored document.
      if (parsed !== null && typeof parsed === 'object') {
        for (const key of WRITABLE) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) patch[key] = parsed[key]
        }
      }
      const settings = await saveSettings(patch)
      return json(res, 200, { settings })
    }

    if (action === 'enhance' && req.method === 'POST') {
      const body = await readBody(req, 256 * 1024)
      const parsed = JSON.parse(body === '' ? '{}' : body)
      const text = typeof parsed?.text === 'string' ? parsed.text.trim() : ''
      if (text === '') return json(res, 400, { error: 'text is required' })

      const settings = await loadSettings()
      if (!settings.enabled) return json(res, 409, { error: 'prompt boost is disabled' })

      const route = resolveRoute(settings, defaultRoute(ctx))
      if (route === undefined) {
        return json(res, 409, {
          error: 'no model is configured: pick one on the Prompt Boost settings page, or set a default model',
        })
      }

      const started = Date.now()
      try {
        const raw = await runEnhancement(ctx, { route, settings, text })
        return json(res, 200, {
          text: unwrapFence(raw),
          provider: route.provider,
          model: route.model,
          source: route.source,
          elapsedMs: Date.now() - started,
        })
      } catch (error) {
        return json(res, 502, { error: messageOf(error), provider: route.provider, model: route.model })
      }
    }

    return json(res, 404, { error: 'unknown action' })
  } catch (error) {
    return json(res, 500, { error: messageOf(error) })
  }
}

/**
 * Mount the Host routes on the web server.
 *
 * @param ctx - the plugin context.
 */
function mountRoutes(ctx) {
  ctx.inject(['webServer'], (routeCtx) => {
    const webServer = routeCtx.get('webServer')
    if (webServer === undefined) return

    routeCtx.effect(() => {
      const dispose = webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => serve(ctx, req, res),
      })
      const released = typeof dispose === 'function' ? dispose : () => {}
      return () => {
        try { released() } catch { /* already released */ }
      }
    }, 'dsh-prompt-boost: routes')
  })
}

/**
 * Apply the Host half.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    console.info('[prompt-boost] host half active; settings at', storePath())
    return () => {}
  }, 'dsh-prompt-boost: boot')

  try {
    mountRoutes(ctx)
  } catch (error) {
    report('route mounting', error)
  }
}
