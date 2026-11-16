/*
 * The title role is drawn by `<Title>` alone (SCRUM-1041). It was applied by hand in about twenty places, so no fix could be
 * made once: at the largest text each of them split "Thiruvananthapuram" mid-word. `<Title>` shrinks a word that will not fit
 * its line and leaves every other title as the role says; a title styled by hand again would split again.
 *
 * Caught: `font(…'title'…)`, `TYPE.title` (a spread or a lookup) and PAGE_TITLE outside `components/ds/Title.tsx` and
 * `shared.ts` (which defines it). `PAGE_TITLE.lineHeight` stays allowed: a skeleton line's height is not a title.
 * ponytail: a regex scan; a role named through a variable (`font(role, …)`) escapes it.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']
const OWNERS = new Set(['components/ds/Title.tsx', 'components/ds/shared.ts'])

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })

/** Every hand-applied title style in `src`, by line. */
export function handRolledTitles(src: string): string[] {
  return src
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|import\b)/.test(line))
    .filter((line) => /\bfont\([^)]*'title'/.test(line) || /\bTYPE(\.title\b|\[\s*'title'\s*\])/.test(line) || /\bPAGE_TITLE\b(?!\.lineHeight)/.test(line))
    .map((line) => line.trim())
}

describe('the title role is drawn by <Title> alone (SCRUM-1041)', () => {
  it('catches each hand-rolled form (negative control)', () => {
    expect(handRolledTitles(`<Text style={[font('title', bold), styles.ink]}>`)).toHaveLength(1)
    expect(handRolledTitles(`<Text style={[font(hero ? 'title' : 'bodyStrong', bold)]}>`)).toHaveLength(1)
    expect(handRolledTitles(`  title: { ...TYPE.title, color: COLOR.textPrimary },`)).toHaveLength(1)
    expect(handRolledTitles(`  name: { ...PAGE_TITLE, color },`)).toHaveLength(1)
    expect(handRolledTitles(`const TITLE_LINE = PAGE_TITLE.lineHeight`)).toEqual([])
    expect(handRolledTitles(`<Title variant={hero ? 'title' : 'bodyStrong'} style={styles.ink}>`)).toEqual([])
  })

  it('holds across app/, components/ and lib/', () => {
    const offenders = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
      .filter((f) => !OWNERS.has(path.relative(ROOT, f)))
      .flatMap((f) => handRolledTitles(fs.readFileSync(f, 'utf8')).map((line) => `${path.relative(ROOT, f)}: ${line.slice(0, 120)}`))
    expect(offenders).toEqual([])
  })
})
