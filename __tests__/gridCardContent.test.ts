import { gridCardContent } from '../lib/gridCardContent'

/**
 * What a card says when it has almost nothing to say.
 *
 * The thin card is the common case, not an edge one — `lib/matchBand.ts`:
 * "`user_interests` was empty in production for weeks, so this path is the live
 * one until interest coverage climbs." A card reduced to a name and two buttons
 * gives nobody a reason to tap either.
 */
describe('the chain always yields something true', () => {
  it('prefers the overlap, named', () => {
    // "You both picked Techno and Board games is the whole product."
    const c = gridCardContent({ sharedInterests: ['Techno', 'Board games'] })
    expect(c.line).toBe('You both picked Techno and Board games')
    expect(c.kind).toBe('interests')
    expect(c.band).toBe('Strong match')
  })

  it('falls to the shared intent when no interest overlaps', () => {
    /*
     * Still an overlap, just a different one — and safe to state without
     * qualification: the server sends only the intersection, and `dating`
     * reaches it after compatibility is already checked, so the line never
     * states anyone's gender.
     */
    const c = gridCardContent({ sharedInterests: [], sharedIntents: ['networking'] })
    expect(c.line).toBe('Both here to network')
    expect(c.kind).toBe('intent')
  })

  it('falls to presence when nothing is shared', () => {
    // The last thing the roster knows that is worth acting on — and on a screen
    // about walking over to somebody, a strong one.
    const c = gridCardContent({ sharedInterests: [], insideNow: true })
    expect(c.line).toBe('Here now')
    expect(c.kind).toBe('presence')
  })

  it('still names a band when there is nothing else at all', () => {
    /*
     * The floor. "Worth saying hello" must not read as a failure: in a room
     * with an empty interest graph everyone is this, and the copy has to be
     * true rather than discouraging.
     */
    const c = gridCardContent({ sharedInterests: [] })
    expect(c.line).toBeNull()
    expect(c.kind).toBeNull()
    expect(c.band).toBe('Worth saying hello')
  })

  it('never invents an overlap', () => {
    // Every rung is a fact the server sent or it is skipped.
    const c = gridCardContent({})
    expect(c.line).toBeNull()
    expect(c.band).toBe('Worth saying hello')
  })

  it('puts the facts before the verdict', () => {
    /*
     * The band always resolves, so ordering it first would mean no card ever
     * reached the rungs below — and "Strong match" is worth less than the two
     * interests it was derived from.
     */
    const rich = gridCardContent({ sharedInterests: ['Techno'], sharedIntents: ['networking'], insideNow: true })
    expect(rich.kind).toBe('interests')
  })
})
