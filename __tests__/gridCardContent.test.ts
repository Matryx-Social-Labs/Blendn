import { readFileSync } from 'fs'
import { join } from 'path'

import { gridCardBox } from '../lib/gridCardContent'

/**
 * The one labelled block on a Grid card.
 *
 * The frame keeps two data sets apart — CORE EXPERTISE is *their* attributes,
 * the box is what you SHARE. Collapsing them is what made a card read
 * "You both picked Techno and Board games" directly above chips saying
 * *Techno, Board games*.
 */
describe('the box holds one thing, strongest first', () => {
  it('prefers shared interests, comma-joined', () => {
    // Frame `1141:5045`: a sentence, not chips. Chips here would repeat the
    // CORE EXPERTISE row's shape directly beneath it.
    const b = gridCardBox({ sharedInterests: ['Techno', 'Board games'] })
    expect(b).toEqual({
      label: 'SHARED INTERESTS',
      value: 'Techno, Board games',
      kind: 'interests',
    })
  })

  it('falls to the shared field when no interest overlaps', () => {
    /*
     * Already computed for ranking and never shown. The same fact reads as an
     * attribute under a name and as a reason to walk over in the box.
     */
    const b = gridCardBox({ sharedInterests: [], sharedWorkField: true, workField: 'Design' })
    expect(b?.label).toBe('SAME FIELD')
    expect(b?.value).toBe('You both work in Design')
  })

  it('does not claim a shared field without the field itself', () => {
    // `workField` is null in any room under eight people, and "You both work in
    // null" is worse than saying nothing.
    const b = gridCardBox({ sharedInterests: [], sharedWorkField: true, workField: null })
    expect(b?.kind).not.toBe('field')
  })

  it('falls to presence when nothing is shared', () => {
    const b = gridCardBox({ sharedInterests: [], insideNow: true })
    expect(b).toEqual({
      label: 'ATTENDING LIVE',
      value: 'In the room right now',
      kind: 'live',
    })
  })

  it('returns null rather than inventing a line', () => {
    /*
     * A real answer. An empty room of strangers with no interest graph yields
     * cards that are a name, a field of work and two buttons — and a line
     * written to fill the space would be worse than the space.
     */
    expect(gridCardBox({ sharedInterests: [] })).toBeNull()
    expect(gridCardBox({})).toBeNull()
  })

  it('shows one thing, never two', () => {
    // Every rung is exclusive: the box is a slot, not a stack.
    const b = gridCardBox({
      sharedInterests: ['Techno'],
      sharedWorkField: true,
      workField: 'Design',
      insideNow: true,
    })
    expect(b?.kind).toBe('interests')
  })

  it('carries no verdict chip', () => {
    /*
     * "Strong match" above a labelled box is a verdict derived from the line
     * beneath it. A card with nothing to share now says nothing rather than
     * grading the silence.
     */
    const b = gridCardBox({ sharedInterests: ['Techno'] })
    expect(JSON.stringify(b)).not.toContain('match')
  })
})

describe('every field the card renders is actually read off the payload', () => {
  /*
   * The bug this exists for, which type-checked and shipped:
   *
   *   `AttendeeProfile` declared `age` and `sharedWorkField`. `GridPerson`
   *   declared them. `gridCardBox` branched on one and the card title rendered
   *   the other. And `MatchScreen`'s map from the API response set NEITHER — so
   *   the title could never say "Priya, 29" and the SAME FIELD box could never
   *   fire, on any card, ever.
   *
   * Nothing catches that. Both are optional, so the compiler is satisfied; both
   * degrade to a card that merely says less, so no test failed and no screen
   * looked broken. **A field is not wired because a type says it exists.**
   *
   * The Blend'n room (`lib/useRoom.ts`) fixed the shape of the bug: both the
   * first load and load-more map through one function, `attendeeFromMatch`
   * (`lib/roomLive.ts`, whose own test pins every field). What is left to
   * guard is that no path grows its own inline map again, and that `toPerson`
   * reads each field onto the `RoomPerson` the screen draws.
   */
  const USE_ROOM = readFileSync(join(__dirname, '..', 'lib/useRoom.ts'), 'utf8')
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('maps BOTH the first load and load-more through attendeeFromMatch', () => {
    // Asserted as a count: a check that it appears *somewhere* passes when
    // the first load drops it and load-more keeps it.
    const src = stripComments(USE_ROOM)
    expect(src.split('.map(attendeeFromMatch)').length - 1).toBe(2)
    // …and no inline payload map beside it.
    expect(src).not.toMatch(/\.map\(\(m\) => \(\{/)
  })

  /** Every field the roster payload carries that a card can show, as `toPerson` reads it. */
  const READ = [
    'a.sharedIntents',
    'a.workField',
    'a.sharedWorkField',
    'a.age',
    'a.insideNow',
    'a.youLiked',
  ] as const

  it.each(READ)('toPerson reads %s', (field) => {
    const src = stripComments(USE_ROOM)
    const toPerson = src.slice(src.indexOf('const toPerson'), src.indexOf('const people'))
    expect(toPerson).toContain(field)
  })
})
