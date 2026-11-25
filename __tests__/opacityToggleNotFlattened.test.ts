/*
 * A View whose opacity comes and goes must say `collapsable={false}` (SCRUM-1048).
 *
 * On Android a View with an opacity is a real view and one without is flattened away, so toggling it moves every child
 * between two parents. If that lands while its screen is leaving, react-native-screens holds every view for the exit
 * transition (`startViewTransition`), the removed child keeps its parent, and inserting it elsewhere kills the app in
 * addViewAt ("The specified child already has a parent"): Button's spinner did, on Room settings' Save, about 1 in 6.
 * Jest renders no native views, so no render test can see it; this scans the source instead.
 *
 * Covered: a `<View` whose `style` names, behind `&&` or `?`, a style of the same file's StyleSheet that sets `opacity: 0`.
 * ponytail: a regex scan; an opacity set inline or from another file escapes it.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.tsx$/.test(e.name) ? [p] : []
  })

/** The `<View …>` opening tags in `src` that toggle an opacity-0 style and are not `collapsable={false}`. */
export function flattenableToggles(src: string): string[] {
  const zero = new Set([...src.matchAll(/^\s+(\w+):\s*\{[^}\n]*\bopacity:\s*0\b[^}\n]*\}/gm)].map((m) => m[1]))
  if (!zero.size) return []
  const tags = [...src.matchAll(/<View\b[^>]*?style=\{\[[^\]]*\][^>]*>/gs)].map((m) => m[0])
  return tags.filter((tag) => {
    const toggled = [...tag.matchAll(/(?:&&|\?)\s*styles\.(\w+)/g)].some((m) => zero.has(m[1]))
    return toggled && !/collapsable=\{false\}/.test(tag)
  })
}

describe('a View whose opacity toggles is never flattened (SCRUM-1048)', () => {
  it('holds across app/, components/ and lib/', () => {
    const offenders = DIRS.flatMap((d) => walk(path.join(ROOT, d))).flatMap((f) =>
      flattenableToggles(fs.readFileSync(f, 'utf8')).map((tag) => `${path.relative(ROOT, f)}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`)
    )
    expect(offenders).toEqual([])
  })

  it('control: catches the shape Button had, and passes it once it says collapsable={false}', () => {
    const sheet = `\nconst styles = StyleSheet.create({\n  content: { flexDirection: 'row' },\n  hidden: { opacity: 0 },\n})\n`
    expect(flattenableToggles(`<View style={[styles.content, spinner && styles.hidden]}>${sheet}`)).toHaveLength(1)
    expect(flattenableToggles(`<View\n  testID="p"\n  style={[styles.content, !shown ? styles.hidden : null]}\n>${sheet}`)).toHaveLength(1)
    expect(flattenableToggles(`<View collapsable={false} style={[styles.content, spinner && styles.hidden]}>${sheet}`)).toEqual([])
    // display: none is not an opacity, and an always-hidden View never toggles.
    expect(flattenableToggles(`<View style={[styles.content, off && styles.gone]}>\nconst styles = { gone: { display: 'none' } }`)).toEqual([])
    expect(flattenableToggles(`<View style={[styles.hidden]}>${sheet}`)).toEqual([])
  })
})
