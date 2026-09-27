import { readFileSync } from 'fs'
import { join } from 'path'
import { matchOpener, matchRowPreview } from '../lib/matchOpener'

/**
 * A match becomes a conversation — the opener, and the sheet that announces it.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// The match moment replaced ConnectionSheet; every face in it draws through `Face`.
const MOMENT = () => stripComments(read('components/blendn/MatchMoment.tsx'))
const FACE = () => stripComments(read('components/blendn/Face.tsx'))
const SCREEN = () => stripComments(read('components/blendn/BlendnScreen.tsx'))
const ROOM = () => stripComments(read('lib/useRoom.ts'))
const DM = () => stripComments(read('app/private-chat/[conversationId].tsx'))

describe('the opener only greets an actual match', () => {
  it('names them when there is a name', () => {
    const o = matchOpener({ fromMatch: true, otherName: 'Cosmic Panda' })
    expect(o?.body).toContain('Cosmic Panda')
  })

  it('is null for an accepted message request', () => {
    /*
     * Those have shown real names since they existed and were never a match, so
     * a match greeting on one is simply false. This is the whole reason
     * `fromMatch` had to become a server field: `theyRevealed` is true for both
     * a never-pseudonymous conversation and a revealed match.
     */
    expect(matchOpener({ fromMatch: false, otherName: 'Aria Vance' })).toBeNull()
    expect(matchOpener({ otherName: 'Aria Vance' })).toBeNull()
    expect(matchRowPreview({ fromMatch: false })).toBeNull()
  })

  it('survives a name it does not have', () => {
    // An unrevealed match legitimately has no better answer, and the copy must
    // not read as a data error the way "Unknown" would.
    const o = matchOpener({ fromMatch: true, otherName: null })
    expect(o).not.toBeNull()
    expect(o?.body).not.toContain('Unknown')
    expect(o?.body).not.toContain('null')
    expect(o?.body).not.toContain('undefined')
  })

  it('treats whitespace as no name', () => {
    expect(matchOpener({ fromMatch: true, otherName: '   ' })?.body).not.toContain('  ')
  })

  it('gives the inbox row a reason rather than the generic fallback', () => {
    /*
     * "Start chatting" is true of any empty thread and says nothing about why
     * this one exists. A row that arrived because two people chose each other
     * should say so before it is opened.
     */
    expect(matchRowPreview({ fromMatch: true })).toBe('You matched — start the conversation')
  })
})

describe('the header is a header, not an empty state', () => {
  it('does not key off message count', () => {
    /*
     * Tying it to "no messages yet" loses a race: whoever liked first gets the
     * push, and if the other person types before they open the app they arrive
     * at an ordinary thread and never learn it came from a match. It also
     * flashes during pagination, when "no messages" and "not loaded yet" look
     * identical.
     */
    const src = DM()
    const block = src.slice(src.indexOf('const opener = matchOpener('))
    expect(block.slice(0, block.indexOf('\n'))).not.toContain('messages.length')
    expect(src).toContain('const opener = matchOpener({ fromMatch: reveal?.fromMatch')
  })

  it('rides in ListHeaderComponent, above the oldest message', () => {
    expect(DM()).toContain('ListHeaderComponent={ListHeader}')
  })

  it('takes pseudonymous from the server, not from which fields arrived', () => {
    /*
     * Driven on iOS: an accepted message request opened with "You can see
     * their name. They can't see yours." and a reveal button the server
     * refuses. The screen inferred "pseudonymous" from the reveal fields being
     * absent, and the server always sent them.
     */
    expect(DM()).toContain('pseudonymous: r.data.pseudonymous ?? r.data.youRevealed !== undefined')
  })

  it('stops the empty state claiming a match that never happened', () => {
    /*
     * It said "You matched with X" for EVERY empty thread, including an
     * accepted message request. The header says it when it is true; the empty
     * state stays neutral.
     */
    expect(DM()).not.toContain('You matched with {otherUserName}')
  })
})

describe('the match moment shows only faces that were earned', () => {
  it('never reads a photo the roster did not already carry', () => {
    /*
     * At the instant of a match an unrevealed person has no photo to show:
     * `rankMatches` sends no `profile_photos` for anyone unrevealed, enforced
     * server-side. Reaching for one anywhere else would make a like a one-way
     * identity disclosure — someone could be identified by liking back and
     * never speaking. So their face is the roster's photo or nothing.
     */
    const src = MOMENT()
    expect(src).not.toContain('profile_photos')
    expect(src).not.toContain('OptimizedImage')
    expect(src).not.toContain('avatarUrl')
    expect(SCREEN()).toContain("them={{ name: room.match?.name ?? '', photo: matchPerson?.photo ?? null }}")
    // …and the roster's photo is exactly what the server sent, never fetched.
    expect(ROOM()).toContain('photo: a.profile_photos?.[0] ?? null')
  })

  it('shows your own face only if you revealed it', () => {
    /*
     * The moment must not show you something about yourself they cannot see.
     * Unrevealed, you are the mark they know you by.
     */
    expect(SCREEN()).toContain(
      "me={controls.revealed ? me : { name: room.match?.you ?? 'You', photo: null }}"
    )
  })

  it('draws the generated mark for anybody without a photo', () => {
    expect(MOMENT()).toContain('<Face name={me.name} photo={me.photo}')
    expect(MOMENT()).toContain('<Face name={them.name} photo={them.photo}')
    expect(FACE()).toContain('pseudonymAvatar(name)')
  })

  it('is seeded on pseudonyms, never a user id', () => {
    // A user id is stable forever and would rebuild the cross-surface identity
    // the pseudonyms exist to prevent.
    for (const src of [MOMENT(), FACE()]) {
      expect(src).not.toMatch(/userId|user_id|\.id\b/)
    }
  })
})

describe('the moment paints without a second request', () => {
  it('takes both pseudonyms from the like response', () => {
    /*
     * `likeAtEvent` already loads both rows to snapshot them onto the
     * conversation, so it returns them. Fetching the conversation first would
     * put a round trip in the middle of the one moment that should feel
     * instant.
     */
    const src = ROOM()
    expect(src).toContain('result.data?.pseudonyms?.them')
    expect(src).toContain('result.data?.pseudonyms?.you')
  })

  it('falls back to the card’s name, which is also the pseudonym', () => {
    // Pre-reveal `attendee.name` IS the pseudonym — `rankMatches` enforces it —
    // so the fallback cannot leak a real name.
    expect(ROOM()).toContain('result.data?.pseudonyms?.them || displayName(attendee.name)')
  })
})
