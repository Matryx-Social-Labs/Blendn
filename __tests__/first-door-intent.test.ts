import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * "Why do you go out?" is asked at the door of the first room (SCRUM-77).
 *
 * Onboarding never wrote `intent_default`, so every account that came through
 * it was refused the board — "add … why you go out" — for a field the flow
 * never asked for. Driven on both platforms: eight steps, RSVP, 403. The
 * server now says `intentNeeded` on check-in while there is no default; this
 * is the client's half, pinned by source because the flow lives in the
 * check-in handler's tray callbacks.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const events = strip(readFileSync(join(__dirname, '..', 'app', '(tabs)', 'events.tsx'), 'utf8'))
const prefs = strip(readFileSync(join(__dirname, '..', 'app', 'event-preferences', '[eventId].tsx'), 'utf8'))

describe('after a check-in that says intentNeeded', () => {
  it('every way out of the post-check-in tray leads to the question', () => {
    const handler = events.slice(events.indexOf("Logger.journey('checkin', 'success'"), events.indexOf('loadCheckinStatusesBatch()'))
    expect(handler).toContain('const askIntent = result.data?.intentNeeded === true')
    expect(handler).toMatch(/params: \{ eventId: event\.id, revealed: '0', askIntent: '1' \}/)
    // The reveal warning's two buttons, "Stay here", "Done" — and "Go to Chat"
    // stacks the question on top of the chat.
    expect(handler.match(/onPress: closeAndAsk/g)).toHaveLength(3)
    expect(handler).toMatch(/closeAndAsk\(\)\s*apiClient\s*\.setMatchPreferences\(event\.id, \{ revealed: true \}\)/)
    expect(handler).toContain('if (askIntent) closeAndAsk()')
  })
})

describe('the question', () => {
  it('leads with intent, saves it as the default, and cannot be answered with nothing', () => {
    expect(prefs).toContain("const askIntent = askIntentParam === '1'")
    expect(prefs).toMatch(/\.\.\.\(askIntent && intentTouched \? \{ rememberIntent: true \} : \{\}\)/)
    expect(prefs).toContain('{askIntent ? intentBlock : revealBlock}')
    expect(prefs).toContain("askIntent ? 'Why do you go out?' : 'Why are you here tonight?'")
    expect(prefs).toContain('disabled={saving || (askIntent && intent.length === 0)}')
  })

  it('never offers Dating to a minor, and shows the server\'s sentence when it refuses', () => {
    // The Android drive: a 17-year-old picked Dating on the last onboarding
    // step and the screen accepted it because the column it wrote is not the
    // one the age gate guards. This write is guarded, so the card is not shown.
    expect(prefs).toContain("setUnder18(typeof age === 'number' && age < 18)")
    expect(prefs).toContain("under18 ? INTENTS.filter((i) => i.value !== 'dating') : INTENTS")
    expect(prefs).toContain("showToast(res.error || 'Could not save. Try again.', 'error')")
  })
})

describe('both doors ask', () => {
  // Driven on iOS 2026-09-21: the event-detail door ("Blend in") checked a
  // fresh account in with no "Why do you go out?", while the Pulse tray asked.
  // Two doors, one rule (SCRUM-77 / SCRUM-188).
  const { readFileSync } = require('fs') as typeof import('fs')
  const { join } = require('path') as typeof import('path')
  it.each([
    'app/(tabs)/events.tsx',
    'components/screens/EventDetailScreen.tsx',
  ])('%s routes to the intent screen when the server says intentNeeded', (file) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8')
    expect(src).toContain('intentNeeded === true')
    expect(src).toContain("askIntent: '1'")
    expect(src).toContain('revealSuggestion')
  })
})
