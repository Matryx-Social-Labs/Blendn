/**
 * A creature always means anonymous (`lib/personFace.ts`, owner F1 B / D1 A): a named person with no photo is their
 * initial on their hue disc, never a creature. So no surface decides creature-or-initial on its own. A face for a
 * person goes through `personFace` (or `<Avatar {...personFace(…)}>`), and only the files below, where everyone drawn
 * is anonymous by design, may pick a creature directly. A new file that draws `<Creature>` or a `kind: 'creature'`
 * face fails here: route it through `personFace`, or add it with the reason it is anonymous.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']

/** Each file allowed to pick a creature, and why everyone it draws that way is anonymous. */
const ANONYMOUS_BY_DESIGN: Readonly<Record<string, string>> = {
  'components/ds/Creature.tsx': 'the creature itself',
  'components/ds/Avatar.tsx': 'draws the face personFace chose',
  'lib/personFace.ts': 'the rule',
  'lib/roomState.ts': 'you, unrevealed in a room (revealed goes through personFace)',
  'app/chat-info/[id].tsx': 'an event room’s roster: pseudonyms',
  'app/private-chat/[conversationId].tsx': 'an ended conversation, and you before you reveal',
  'app/user/[id].tsx': 'your side of a match is your pseudonym in that room',
  'app/waves/[eventId].tsx': 'waves are between pseudonyms',
  'components/banter/BanterWavesRow.tsx': 'waves are between pseudonyms',
  'components/blendn/WaveToast.tsx': 'waves are between pseudonyms',
  'components/ds/WaveFace.tsx': 'waves are between pseudonyms (a crew’s is its emblem)',
  'components/ds/NotificationRow.tsx': 'a wave notification names nobody',
  'components/board/BoardSections.tsx': 'Lobby posts are pseudonymous',
  'components/board/LobbyCompose.tsx': 'Lobby posts are pseudonymous',
  'components/board/LobbyParts.tsx': 'Lobby posts are pseudonymous',
  'components/board/LobbyPreview.tsx': 'Lobby posts are pseudonymous',
  'components/chat/SenderCard.tsx': 'an event room’s sender',
  'components/crews/BlendRoom.tsx': 'a Blend’s person side, before the reveal',
  'components/ds/MomentBlend.tsx': 'a Blend’s person side, before the reveal',
  'components/ds/RevealSheet.tsx': 'the people before the reveal',
  'components/ds/LikingAsChip.tsx': 'your pseudonym',
  'components/profile/ProfileHeroStage.tsx': 'an unrevealed profile',
  'components/profile/ProfileLensHero.tsx': 'an unrevealed profile',
}

const PICKS_CREATURE = /<Creature\b|\bkind[=:] ?["'{]*'?creature['"]/

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) return rel === 'app/preview' ? [] : sources(rel)
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : []
  })
}

const picking = DIRS.flatMap(sources).filter((f) => PICKS_CREATURE.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))

describe('a creature only for the anonymous', () => {
  it('the rule fires on each way of picking one', () => {
    expect(PICKS_CREATURE.test('<Avatar kind="creature" pseudonym={p.name} size={40} />')).toBe(true)
    expect(PICKS_CREATURE.test("p.photo ? { kind: 'photo', uri: p.photo } : { kind: 'creature', pseudonym: p.name }")).toBe(true)
    expect(PICKS_CREATURE.test('<Creature {...creatureFor(name)} size={56} />')).toBe(true)
    expect(PICKS_CREATURE.test('<Avatar {...personFace({ named: true, name, photo })} size={40} />')).toBe(false)
  })

  it('only the anonymous-by-design files pick a creature directly', () => {
    expect(picking.filter((f) => !(f in ANONYMOUS_BY_DESIGN))).toEqual([])
  })

  it('every listed file still does (a stale entry would let a named surface slip in)', () => {
    expect(Object.keys(ANONYMOUS_BY_DESIGN).filter((f) => !picking.includes(f))).toEqual([])
  })
})
