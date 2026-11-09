/**
 * Motion audit M6/M13 (SCRUM-1001, iOS drive 2026-11-09): a row that leaves a list fades in place while the rows below close
 * the gap (`exiting` on the row, `itemLayoutAnimation` on the list). With `removeClippedSubviews` on, neither plays on iOS:
 * on Friends › Requests the answered row was gone in one frame and the next was already at the top, while Going and Blocked
 * users, the same presets without clipping, faded and reflowed on the same build. Clipping takes the cell's native view out
 * from under the animation. (Android, where clipping is the default, played Going's exit: this is the iOS path.)
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(name)) out.push(full)
  }
  return out
}
const uncommented = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

it('no list that animates its rows leaving clips its subviews', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))].filter((f) => !relative(ROOT, f).startsWith('app/preview'))
  const found = files
    .map((f) => ({ f, source: uncommented(readFileSync(f, 'utf8')) }))
    .filter(({ source }) => /\bitemLayoutAnimation=/.test(source))
    .filter(({ source }) => /\bremoveClippedSubviews(?!=\{false\})\b/.test(source))
    .map(({ f }) => relative(ROOT, f))
  expect(found).toEqual([])
})
