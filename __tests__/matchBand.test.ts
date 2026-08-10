import { intentSentence, matchBand, matchBandLabel, sharedInterestSentence } from '../lib/matchBand'

/**
 * The card's band and its sentence — both written, neither called.
 *
 * `lib/matchBand.ts` has had zero importers since it was written.
 * `MatchScreen.tsx` renders `sharedInterests` as a *count* and drops
 * `sharedIntents` entirely, so the one thing the product is for — "you both
 * picked Techno and Board games" — is computed and thrown away.
 *
 * These tests come before the wiring (PR 13) deliberately: the module's own
 * comment says it must degrade honestly when the interest graph is empty, and
 * that is the live case in production. Pinning it now means the rendering PR
 * cannot quietly change what an empty room says.
 */

const card = (sharedInterests: string[], sharedIntents: string[] = []) =>
  ({ sharedInterests, sharedIntents }) as Parameters<typeof matchBand>[0]

describe('matchBand', () => {
  it('calls two or more shared interests strong', () => {
    expect(matchBand(card(['Techno', 'Board games']))).toBe('strong')
  })

  it('calls exactly one good', () => {
    expect(matchBand(card(['Techno']))).toBe('good')
  })

  it('calls none "some" rather than nothing', () => {
    /*
     * The live path. `user_interests` was empty in production for weeks, so
     * every card had an empty overlap — and the honest answer there is a band
     * that does not read as a failure, not a 0% and not a blank card.
     */
    expect(matchBand(card([]))).toBe('some')
  })

  it('survives a card with no sharedInterests key at all', () => {
    // An older server, or a response shape that changes: the card still has to
    // render.
    expect(matchBand({} as Parameters<typeof matchBand>[0])).toBe('some')
  })
})

describe('matchBandLabel', () => {
  it('never says a number', () => {
    // A percentage implies a precision this data cannot support and invites
    // gaming. The Figma asked for one; this is the deliberate refusal.
    for (const band of ['strong', 'good', 'some'] as const) {
      expect(matchBandLabel(band)).not.toMatch(/\d/)
      expect(matchBandLabel(band)).not.toMatch(/%/)
    }
  })

  it('does not make the empty case read as a failure', () => {
    // In a room with no interest data everyone is "some", so the copy has to be
    // true and still worth acting on.
    expect(matchBandLabel('some')).toBe('Worth saying hello')
    expect(matchBandLabel('some').toLowerCase()).not.toMatch(/weak|poor|low|no match/)
  })
})

describe('sharedInterestSentence', () => {
  it('names one', () => {
    expect(sharedInterestSentence(card(['Techno']))).toBe('You both picked Techno')
  })

  it('names two, joined with "and"', () => {
    expect(sharedInterestSentence(card(['Techno', 'Board games']))).toBe(
      'You both picked Techno and Board games'
    )
  })

  it('names two and counts the rest', () => {
    // A card is a glance, not a list. Three named items is already too long on
    // a phone, and the count keeps the sentence true.
    expect(sharedInterestSentence(card(['Techno', 'Board games', 'Hiking', 'Film']))).toBe(
      'You both picked Techno, Board games and 2 more'
    )
  })

  it('returns null rather than an empty phrase', () => {
    // So the caller renders nothing at all. "You both picked" with nothing
    // after it is worse than silence, and inventing an overlap is worse again.
    expect(sharedInterestSentence(card([]))).toBeNull()
  })

  it('never invents an overlap', () => {
    const sentence = sharedInterestSentence(card(['Techno']))
    expect(sentence).not.toMatch(/Board games/)
  })
})

describe('intentSentence', () => {
  it('names the shared intent', () => {
    // `sharedIntents` is the overlap only — the server intersects the viewer's
    // social intents with theirs — so "Both here to network" is literally true.
    expect(intentSentence(['networking'])).toBe('Both here to network')
    expect(intentSentence(['friendship'])).toBe('Both here to make friends')
  })

  it('says dating only when the server put it there', () => {
    /*
     * And by then compatibility has already been checked — which is exactly
     * what lets the card claim it without ever stating anyone's gender.
     */
    expect(intentSentence(['dating'])).toBe('Both open to dating')
  })

  it('never claims a shared "just here"', () => {
    // The server excludes it from the shared set, and "we are both merely
    // present" is not a thing to say to anybody. No phrase is invented for it.
    expect(intentSentence(['just_here'])).toBeNull()
  })

  it('returns null for nothing shared, so the caller falls through', () => {
    expect(intentSentence([])).toBeNull()
    expect(intentSentence(undefined)).toBeNull()
  })

  it('ignores an intent it does not recognise rather than rendering it raw', () => {
    // A value added server-side before the app knows about it must not appear
    // on a card as a bare slug.
    expect(intentSentence(['speed_dating'])).toBeNull()
    expect(intentSentence(['speed_dating', 'networking'])).toBe('Both here to network')
  })
})
