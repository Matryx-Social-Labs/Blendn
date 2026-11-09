/**
 * Motion audit M6/M13 (SCRUM-1001, iOS drive 2026-11-09): a row that leaves a list fades in place while the rows below close
 * the gap (`exiting` on the row, `itemLayoutAnimation` on the list). With `removeClippedSubviews` on, neither plays: on
 * Friends › Requests the answered row was gone in one frame and the next was already at the top, while Going and Blocked
 * users, the same presets without clipping, faded and reflowed. Clipping takes the cell's native view out from under the
 * animation. It is on by default on Android, so a list whose rows leave says `false` out loud.
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

it('every list that animates its rows leaving keeps their views (removeClippedSubviews={false})', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))].filter((f) => !relative(ROOT, f).startsWith('app/preview'))
  const found = files
    .filter((f) => /\bitemLayoutAnimation=/.test(readFileSync(f, 'utf8')))
    .filter((f) => {
      const source = readFileSync(f, 'utf8')
      const clipping = /\bremoveClippedSubviews(?!=\{false\})\b/.test(source.replace(/^\s*(\/\/|\*).*$/gm, ''))
      return clipping || !/\bremoveClippedSubviews=\{false\}/.test(source)
    })
    .map((f) => relative(ROOT, f))
  expect(found).toEqual([])
})
