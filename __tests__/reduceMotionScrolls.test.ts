/**
 * Audit L3 (a11y-motion 2026-10-24): a programmatic scroll follows Reduce Motion. Six sites scrolled with a literal
 * `animated: true` (the Pulse's coach-mark overflow, Banter's "new above" pill, Edit profile's refused Save, the rating
 * form's note, the Sheet's focused field, the list's scroll-to-index fallback) while the rest of the app used
 * `animated: !reduceMotion`. A smooth scroll is the movement the setting asks to drop; the jump still lands.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

it('no scroll in the app animates regardless of Reduce Motion', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))].filter((f) => !relative(ROOT, f).startsWith('app/preview'))
  const found = files.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, i) => ({ line: line.trim(), at: `${relative(ROOT, f)}:${i + 1}` }))
      .filter(({ line }) => /\banimated:\s*true\b/.test(line) && !line.startsWith('*') && !line.startsWith('//'))
      .map(({ at }) => at)
  )
  expect(found).toEqual([])
})

/**
 * Motion audit M9 (2026-11-01): the two chats scrolled to the end through `scrollListToEnd(list, animated)`, a variable,
 * so the literal check above could not see that neither route read the setting. Every call passes `false` or a value
 * that names Reduce Motion.
 */
it('every scroll to the end of a chat follows Reduce Motion', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib'))]
  const found = files.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, i) => ({ line: line.trim(), at: `${relative(ROOT, f)}:${i + 1}` }))
      .filter(({ line }) => /\bscrollListToEnd\(/.test(line) && !/^export function/.test(line) && !line.startsWith('import'))
      .filter(({ line }) => {
        const arg = line.slice(line.indexOf('scrollListToEnd(')).match(/,\s*([^)]*)\)/)?.[1] ?? ''
        return arg.trim() !== 'false' && !/reduceMotion/.test(arg)
      })
      .map(({ at }) => at)
  )
  expect(found).toEqual([])
})
