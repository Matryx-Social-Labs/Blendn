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
