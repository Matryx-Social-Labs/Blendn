/**
 * Save is a bookmark labelled "Save"/"Saved" (SCRUM-1074 S1, owner 2026-11-17): a heart read as a like next to Wave, and
 * the Like is retired. The Save heart is deleted, not kept as a fallback (delete-deprecated): every Save surface draws the
 * bookmark, and a heart may stand only for a real like (a crew's like, a match, a reaction), in the files listed here.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Where Save is drawn: the event page's bar, a Pulse row, a Saved row on Going. */
const SAVE_SURFACES = ['components/scene/SceneBar.tsx', 'components/pulse/MoreRow.tsx', 'app/(tabs)/going.tsx']

/** A heart that means a like, never Save (file → why). */
const LIKES: Record<string, string> = {
  'components/ds/Facepile.tsx': 'a person who liked you',
  'components/ds/HeartPop.tsx': 'the room’s double-tap like for your crew',
  'components/ds/PersonCard.tsx': 'a crew’s like',
  'components/ds/chatShared.ts': 'the ❤️ reaction',
  'lib/notificationRows.ts': 'a match notification',
  'lib/notificationPrefs.ts': 'the matches channel',
  'app/preview/ds-p1.tsx': 'the gallery’s Likes and matches row',
}

function files(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.join(dir, d.name)
    if (d.isDirectory()) return files(rel)
    return /\.(ts|tsx)$/.test(d.name) ? [rel] : []
  })
}

it('every Save surface draws the bookmark and names no heart', () => {
  for (const f of SAVE_SURFACES) {
    const src = read(f)
    expect({ f, bookmark: /['"]bookmark['"]/.test(src) }).toEqual({ f, bookmark: true })
    expect({ f, heart: src.match(/heart/gi) ?? [] }).toEqual({ f, heart: [] })
  }
})

it('a heart glyph is only ever a like', () => {
  const HEART = /(icon|name)=["{]\s*['"]?heart['"]|['"]heart['"]\s*[,}]|:\s*['"]heart['"]/
  const found = ['app', 'components', 'lib'].flatMap(files).filter((f) => HEART.test(read(f)) && !f.startsWith(path.join('components', 'ui')))
  expect(found.filter((f) => !(f in LIKES)).sort()).toEqual([])
})
