/*
 * The house apostrophe is ’, everywhere a person reads (r7 L16: "I'm going", "Nobody's", "BLEND'N+", the Android app label).
 * Scans every "…" and `…` literal and one-line JSX text in app/, components/ and lib/ for a typewriter ' between letters;
 * comments are skipped. ponytail: a line scan, not a parser — a literal split across lines escapes it.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })

// A letter or an interpolation's close, then ' and a letter ("${name}'s"), or the JSX entity.
const TYPEWRITER = /[A-Za-z}]'[A-Za-z]|&apos;/
const LITERALS = /"[^"\n]*"|`[^`\n]*`|>[^<>{}\n]*</g
const COMMENT = /^\s*(\/\/|\*|\/\*|\{\/\*)/

it('no copy carries a typewriter apostrophe', () => {
  const offenders = ['app', 'components', 'lib']
    .flatMap((d) => walk(path.join(ROOT, d)))
    .flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line: line.replace(/\s\/\/.*$/, ''), at: `${path.relative(ROOT, file)}:${i + 1}` }))
        .filter(({ line }) => !COMMENT.test(line) && (line.match(LITERALS) ?? []).some((lit) => TYPEWRITER.test(lit)))
        .map(({ at }) => at)
    )
  expect(offenders).toEqual([])
})

it('the app’s name on the home screen is Blend’n on both platforms', () => {
  expect(fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8')).not.toMatch(/Blend\\?'n/)
  expect(fs.readFileSync(path.join(ROOT, 'ios/blendn/Info.plist'), 'utf8')).not.toMatch(/Blend('|&apos;)n/)
})
