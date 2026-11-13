/*
 * A crew emblem's scene plays once, on its moment, and never in a list (owner, 2026-11-12, SCRUM-1053): in a 214-crew
 * room nothing in the Crews view moves. Only these hosts may pass a `scene` to <CrewEmblem>, or an `emblemScene` to
 * <CrewCard>, and each is one emblem on its own screen. A new host is a design decision: add it here with its moment.
 * Jest cannot see a list scroll, so this scans the source instead.
 * Control: adding `scene="dance"` to a Banter row's emblem (BanterParts, `ROW_AVATAR`) failed the first test.
 * ponytail: a regex scan; a scene passed through a spread escapes it.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.tsx$/.test(e.name) ? [p] : []
  })

/** Each host, and the moment it plays on. */
const HOSTS: Record<string, string> = {
  'components/crews/CrewHead.tsx': 'dance · the crew page, once on entry',
  'app/crews/invite/[crewId].tsx': 'wave · "Priya asked you in"',
  'components/ds/MomentBlend.tsx': 'clink · the Mix, both emblems once they land',
  'components/ds/CrewCard.tsx': "forwards `emblemScene`, which only Make a crew's preview passes",
  'components/crews/MakeSteps.tsx': "dance · Make a crew's preview, on every Shuffle",
  'components/ds/CrewStrip.tsx': 'cheer · your crew check-in moment, once per crew per night (RoomCrews decides which row)',
  'components/crews/WithCrewChip.tsx': 'cheer · "With {crew}" landing on your own hold',
  'app/preview/ds-p5.tsx': 'every scene · the dev-only harness for moments not built yet',
}

const uses = ['app', 'components'].flatMap((d) => walk(path.join(ROOT, d))).flatMap((file) => {
  const rel = path.relative(ROOT, file)
  const src = fs.readFileSync(file, 'utf8')
  return [...src.matchAll(/<CrewEmblem\b[^>]*\bscene=|<CrewCard\b[^>]*?\bemblemScene=|^\s*emblemScene=/gms)].map(() => rel)
})

describe('crew emblem scenes play only on their moments', () => {
  it('no other file passes a scene', () => {
    expect([...new Set(uses)].filter((f) => !HOSTS[f])).toEqual([])
  })

  it('every listed host still does (a stale entry would let a list in under its name)', () => {
    expect(Object.keys(HOSTS).filter((f) => !uses.includes(f))).toEqual([])
  })

  it('a card in a list never asks for one: only the preview card passes emblemScene', () => {
    const passing = ['app', 'components'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => /emblemScene=/.test(fs.readFileSync(f, 'utf8')))
    expect(passing.map((f) => path.relative(ROOT, f))).toEqual(['components/crews/MakeSteps.tsx'])
  })
})
