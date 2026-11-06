/**
 * The RSVP slot (A78, PR #401 review): a waitlist place never reads "You're
 * going", and the pill waits for the server — spinner, label unchanged —
 * before the "You're going" sequence runs.
 */
import { render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }))

import { rsvpCtaState } from '../components/scene/SceneSections'
import { DockRow } from '../components/ds/DockRow'
import { eventDock } from '../lib/eventFacts'

describe('the RSVP slot', () => {
  it('reads the server’s answer: going is a seat, waitlisted is not', () => {
    expect(rsvpCtaState('going')).toBe('rsvpd')
    expect(rsvpCtaState('waitlisted')).toBe('waitlisted')
    expect(rsvpCtaState(null)).toBe('rsvp')
    const dock = (cta: Parameters<typeof eventDock>[0]['cta']) => eventDock({ cta, when: 'Sat 8 Nov · 6 PM', roomOpen: false, canInvite: true, between: null, alone: false })
    expect(dock('going')?.action?.label).toBe('Open the room')
    expect(dock('waitlisted')?.state).toBe('On the waitlist')
    expect(dock('waitlisted')?.state).not.toMatch(/going/i)
  })

  it('draws a waitlisted RSVP as "On the waitlist"', async () => {
    await render(<DockRow state="On the waitlist" sub="Change" onPressState={jest.fn()} />)
    expect(screen.getByLabelText('On the waitlist. Change')).toBeTruthy()
    expect(screen.queryByText("You’re going")).toBeNull()
  })

  it('pending: the DS button\'s busy state, the label unchanged (its spinner is the design system\'s, #24, #48)', async () => {
    await render(<DockRow state="Free" action={{ label: 'I’m going', kind: 'primary', onPress: jest.fn(), loading: true }} />)
    expect(screen.getByLabelText('I’m going').props.accessibilityState).toEqual(expect.objectContaining({ busy: true }))
    const src = readFileSync(join(__dirname, '..', 'components', 'ds', 'DockRow.tsx'), 'utf8')
    expect(src).not.toContain('ActivityIndicator')
  })

  it('the screen is not optimistic: it marks the request pending and sets the status only from the answer', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8')
    const handler = src.slice(src.indexOf('const handleToggleRsvp'), src.indexOf('}, [id, user, event, rsvpStatus'))
    const beforeAwait = handler.slice(0, handler.indexOf('await apiClient.rsvpToEvent'))
    expect(beforeAwait).not.toContain("setRsvpStatus('going')")
    expect(beforeAwait).toContain('setRsvpPending(true)')
    expect(beforeAwait).toMatch(/if \(rsvpInFlight\.current\) return/)
    expect(handler).toContain('setRsvpStatus(result.data.rsvpStatus)')
    // The cancel holds the same guard, so its tray can't reopen mid-request.
    const withdraw = src.slice(src.indexOf('const withdrawRsvp'), src.indexOf('const confirmWithdrawRsvp'))
    expect(withdraw).toMatch(/if \(rsvpInFlight\.current\) return/)
    expect(src).toContain("loading: dock.action.does === 'rsvp' ? rsvpPending")
  })
})

describe('closing the Room returns to the event it was opened from (ROOM-13)', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
  it('"Blend in" (the hold) asks the overlay to come back to this event; the other doors do not', () => {
    const src = read('components', 'screens', 'EventDetailScreen.tsx')
    // The overlay lives under the root stack: the page still steps back to the tabs first, or the Room opens unseen.
    expect(src).toMatch(/router\.dismissTo\('\/\(tabs\)\/events'\)/)
    expect(read('components', 'scene', 'useEventCheckIn.tsx')).toContain('openRoomOf(id)')
    expect(read('lib', 'blendnOverlay.ts')).toMatch(/export function openRoomOf[^}]*returnTo = eventId/s)
    expect(src.match(/returnToEvent/g)).toBeNull()
  })
  it('the overlay re-opens the event once it has closed, and only when one was stored', () => {
    const src = read('components', 'blendn', 'BlendnScreen.tsx')
    expect(src).toMatch(/const back = takeReturnTo\(\)\s*blendnClosed\(\)[^\n]*\n[^\n]*\n?\s*if \(back\) router\.push\(\{ pathname: '\/event\/\[id\]', params: \{ id: back \} as never \}\)/)
  })
})
