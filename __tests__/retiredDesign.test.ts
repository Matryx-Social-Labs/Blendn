/**
 * Superseded looks are deleted, not kept as fallbacks (owner, 2026-11-17: "remove them completely if something is
 * deprecated so that the app fails and shows us to fix it"). The deletions themselves make any leftover caller fail
 * typecheck; this pins that none of them is brought back under a new import or a copied string:
 *
 * - the pre-creature anonymous avatar (`lib/pseudonymAvatar`: an emoji on a gradient disc) — a face is `personFace` /
 *   `<Avatar>` / `<Creature>`, and the seed hashes live in `lib/creatureSeed`;
 * - Avatar's crew square (a two-colour plate under a `users` icon) — a crew is its `<CrewEmblem>`;
 * - Liquid Ember's palette, scales and fonts (`EMBER`, `TYPE`, `EMBER_FONTS`, Plus Jakarta Sans, Manrope) — the design
 *   system is `lib/design/tokens`, Satoshi and Geist Mono; `lib/theme` keeps only `tint` and `OPACITY`;
 * - the pre-token motion names (`MOTION_DURATION` and friends) — `DURATION`, `EASING`, `STAGGER`, `SPRING`;
 * - `@deprecated` exports left lying around: delete them, or record them in the ROADMAP with an owner and a date.
 *
 * Each rule is shown to fire on a sample first, so a pattern that stopped matching cannot pass silently.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) return sources(rel)
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : []
  })
}

const FILES = DIRS.flatMap(sources).map((file) => ({ file, text: fs.readFileSync(path.join(ROOT, file), 'utf8') }))

const RULES: readonly { name: string; pattern: RegExp; sample: string }[] = [
  {
    name: 'the pre-creature avatar (lib/pseudonymAvatar)',
    pattern: /from ['"][^'"]*pseudonymAvatar['"]|\b(pseudonymAvatar|avatarStack)\(/,
    sample: "import { pseudonymAvatar } from '../lib/pseudonymAvatar'",
  },
  {
    name: 'Avatar’s crew square (a crew is its CrewEmblem)',
    pattern: /<Avatar\b[^>]*?\bkind=["'{]+crew\b/,
    sample: '<Avatar size={40}\n  kind="crew" plate={P} />',
  },
  {
    name: 'Liquid Ember’s fonts (Plus Jakarta Sans, Manrope)',
    pattern: /\b(Manrope|PlusJakartaSans)_\d{3}|@expo-google-fonts\/(manrope|plus-jakarta-sans)/,
    sample: "fontFamily: 'PlusJakartaSans_700Bold'",
  },
  {
    name: 'Liquid Ember’s palette and scales from lib/theme',
    pattern: /\bimport \{[^}]*\b(EMBER|EMBER_RADIUS|EMBER_FONTS|TYPE|SPACE|GUTTER|CONTROL|ICON|SWITCH_COLORS|MAX_FONT_SCALE)\b[^}]*\} from ['"][./]*(lib\/)?theme['"]/,
    sample: "import { EMBER, tint } from '../../lib/theme'",
  },
  {
    name: 'the pre-token motion names',
    pattern: /\bMOTION_(DURATION|EASING|STAGGER|SPRING)\b/,
    sample: 'withTiming(1, { duration: MOTION_DURATION.fast })',
  },
  {
    name: 'an @deprecated export (delete it, or put it in the ROADMAP with an owner and a date)',
    pattern: /@deprecated\b/,
    sample: '/** @deprecated use DURATION */',
  },
]

describe('retired looks stay deleted', () => {
  it.each(RULES)('$name: the rule fires on its sample', ({ pattern, sample }) => {
    expect(pattern.test(sample)).toBe(true)
  })

  it.each(RULES)('$name: no source in app/, components/ or lib/ uses it', ({ pattern }) => {
    expect(FILES.filter(({ text }) => pattern.test(text)).map(({ file }) => file)).toEqual([])
  })

  it('the deleted files stay deleted', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/pseudonymAvatar.ts'))).toBe(false)
  })

  it('lib/theme holds only tint and OPACITY', () => {
    expect(Object.keys(require('../lib/theme')).sort()).toEqual(['OPACITY', 'tint'])
  })

  it('the old font packages are not dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /manrope|plus-jakarta/.test(d))).toEqual([])
  })

  it('an Avatar never draws an icon as a face', () => {
    const avatar = fs.readFileSync(path.join(ROOT, 'components/ds/Avatar.tsx'), 'utf8')
    expect(/<Icon\b/.test('<Icon name="users" />')).toBe(true)
    expect(avatar).not.toMatch(/<Icon\b/)
  })
})
