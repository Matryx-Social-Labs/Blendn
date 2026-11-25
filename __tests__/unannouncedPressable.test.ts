/*
 * A Pressable that says `accessible={false}` must also say `importantForAccessibility="no"` (SCRUM-1040).
 *
 * `accessible={false}` keeps a Pressable out of VoiceOver, but on Android Pressable stays `focusable` (it defaults to
 * true whatever `accessible` says), so TalkBack still lands on it and, with no name, reads "Unlabelled". The email
 * sheet's sky did, on sign-in; the sheet scrim, the text fields' capsules and the search field's did the same. "no"
 * takes the view alone out of the reading order: a TextInput inside it is still read. PhotoGridTile found it first
 * (audit L8). Jest renders no native views, so this scans the source.
 * ponytail: a regex scan over `<Pressable …>` opening tags; a spread prop object escapes it.
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

/** The `<Pressable …>` opening tags in `src` that say `accessible={false}` and leave Android's reading order alone. */
export function unannouncedPressables(src: string): string[] {
  const tags = [...src.matchAll(/<Pressable\b(?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*>/g)].map((m) => m[0])
  return tags.filter((tag) => /\baccessible=\{false\}/.test(tag) && !/\bimportantForAccessibility=/.test(tag))
}

describe('a Pressable kept from screen readers is kept from TalkBack too (SCRUM-1040)', () => {
  it('holds across app/, components/ and lib/', () => {
    const offenders = DIRS.flatMap((d) => walk(path.join(ROOT, d))).flatMap((f) =>
      unannouncedPressables(fs.readFileSync(f, 'utf8')).map((tag) => `${path.relative(ROOT, f)}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`)
    )
    expect(offenders).toEqual([])
  })

  it('control: catches the email sheet’s sky as it was, and passes it once it says importantForAccessibility="no"', () => {
    expect(unannouncedPressables(`<Pressable testID={testID && \`\${testID}-sky\`} accessible={false} onPress={Keyboard.dismiss} style={StyleSheet.absoluteFill} />`)).toHaveLength(1)
    expect(unannouncedPressables(`<Pressable\n  testID="box"\n  accessible={false}\n  onPress={() => input.current?.focus()}\n  style={[styles.box, secure && { paddingRight: eye }]}\n>`)).toHaveLength(1)
    expect(unannouncedPressables(`<Pressable accessible={false} importantForAccessibility="no" onPress={f} />`)).toEqual([])
    // A Pressable screen readers can reach is not this rule's business.
    expect(unannouncedPressables(`<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={f} />`)).toEqual([])
  })
})
