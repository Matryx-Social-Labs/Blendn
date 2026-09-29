import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * "Why do you go out?" is asked at the door of the first room (SCRUM-77).
 *
 * Onboarding never wrote `intent_default`, so every account that came through
 * it was refused the board — "add … why you go out" — for a field the flow
 * never asked for. Driven on both platforms: eight steps, RSVP, 403. The
 * server now says `intentNeeded` on check-in while there is no default; this
 * is the client's half.
 *
 * What the question says, that a refused save shows the server's sentence, and
 * that a minor is never offered Dating are rendered in
 * `eventPreferencesScreen.test.tsx`; the route both doors push is asserted in
 * `checkIn.test.ts`. What is read as source here is the two doors' hand-off,
 * which sits in a tray callback and a 287-line hook that are not rendered.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const events = strip(readFileSync(join(__dirname, '..', 'app', '(tabs)', 'events.tsx'), 'utf8'))

describe('after a check-in that says intentNeeded', () => {
  it('every way out of the post-check-in tray leads to the question', () => {
    const start = events.indexOf("Logger.journey('checkin', 'success'")
    const handler = events.slice(start, events.indexOf('} catch (error) {', start))
    expect(handler).toContain('const { askIntent } = outcome')
    expect(handler).toContain('router.push(askIntentRoute(event.id))')
    // The reveal warning's two buttons, "Stay here", "Done" — and "Go to Chat"
    // stacks the question on top of the chat.
    expect(handler.match(/onPress: closeAndAsk/g)).toHaveLength(3)
    expect(handler).toMatch(/closeAndAsk\(\)\s*apiClient\s*\.setMatchPreferences\(event\.id, \{ revealed: true \}\)/)
    expect(handler).toContain('if (askIntent) closeAndAsk()')
  })
})

describe('both doors ask', () => {
  // Driven on iOS 2026-09-21: the event-detail door ("Blend in") checked a
  // fresh account in with no "Why do you go out?", while the Pulse tray asked.
  // Two doors, one rule (SCRUM-77 / SCRUM-188).
  // The event screen's door is `lib/useCheckInFlow.ts`, which the Blend'n room
  // shares.
  it.each([
    'app/(tabs)/events.tsx',
    'lib/useCheckInFlow.ts',
  ])('%s routes to the intent screen when the server says intentNeeded', (file) => {
    // One helper reads the server's answer; both doors act on it.
    const src = readFileSync(join(__dirname, '..', file), 'utf8')
    expect(src).toContain('submitCheckIn(')
    expect(src).toContain('askIntentRoute(')
    expect(src).toContain('outcome.revealSuggestion')
  })
})
