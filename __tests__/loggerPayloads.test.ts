/**
 * A warning or an error is sent to Sentry with its details as `extra` (lib/logger `reportToSentry`), so a log line's
 * details are a crash report's contents (review MED-1). They say what happened: a status, a count, a shape, a host, an
 * error. Never what somebody wrote, uploaded or was sent: no payload, no body, no URL of a person's photo or a link.
 * The scrubber (lib/sentry `scrubDeep`) is the net under this; this is the rule above it.
 *
 * Negative control: putting back `{ data: result.data }` in lib/useBanterInbox.ts (or `body: result.body` in
 * lib/photoUtils.ts) fails it, naming the file and line.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
/** Detail keys (`{ key: …` or a shorthand `{ key, …`) that carry content rather than say what happened. */
const CONTENT_KEYS = /[{,]\s*(data|body|payload|response|text|content|url|uri|path|draft|members)\s*[:,}]/

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) return sources(rel)
    return /\.tsx?$/.test(name) ? [rel] : []
  })
}

/** Every `Logger.<levels>(…)` call's details (its arguments after the message), with its line. */
function reportedDetails(file: string, levels = 'warn|error'): { line: number; details: string }[] {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const calls: { line: number; details: string }[] = []
  for (const match of src.matchAll(new RegExp(`Logger\\.(${levels})\\(`, 'g'))) {
    let depth = 1
    let end = match.index! + match[0].length
    while (end < src.length && depth) {
      if (src[end] === '(') depth += 1
      else if (src[end] === ')') depth -= 1
      end += 1
    }
    const args = src.slice(match.index! + match[0].length, end - 1)
    // Details are everything after the message: an object literal, or a variable that holds one (`coords`).
    const brace = args.indexOf('{')
    const afterMessage = args.replace(/^\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*(?:,\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*)?/, '')
    const details = brace >= 0 ? args.slice(brace) : afterMessage
    if (details.trim()) calls.push({ line: src.slice(0, match.index).split('\n').length, details })
  }
  return calls
}

it('no warning or error logs a payload, a body or a URL', () => {
  const offenders = ['app', 'components', 'lib'].flatMap(sources).flatMap((file) =>
    reportedDetails(file)
      .filter(({ details }) => CONTENT_KEYS.test(details))
      .map(({ line, details }) => `${relative(ROOT, join(ROOT, file))}:${line} ${details.replace(/\s+/g, ' ').slice(0, 80)}`),
  )
  expect(offenders).toEqual([])
})

/**
 * Where somebody is, to the metre, is not a log line at any level. `Logger.journey` / `info` / `debug` are console-only
 * (development builds), but a warn or an error lands in Sentry, and a line that is fine at one level becomes a
 * report when someone raises it. So no call, at any level, carries a fix: say that the pass ran, never where.
 */
const LOCATION_KEYS = /\b(lat|lon|lng|latitude|longitude|coords?|userLocation)\b/

it('no log call, at any level, carries a coordinate', () => {
  const offenders = ['app', 'components', 'lib'].flatMap(sources).flatMap((file) =>
    reportedDetails(file, 'debug|info|warn|error|journey')
      .filter(({ details }) => LOCATION_KEYS.test(details))
      .map(({ line, details }) => `${relative(ROOT, join(ROOT, file))}:${line} ${details.replace(/\s+/g, ' ').slice(0, 80)}`),
  )
  expect(offenders).toEqual([])
})
