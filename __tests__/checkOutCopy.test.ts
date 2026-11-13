/**
 * Audit A-2 / C-2 (SCRUM-1045): one way to ask about checking out, from one copy source, at all three doors (the event
 * page's sheet, the room's ⋯, the Events list's ⋯); and the event page counts you out on the server's yes.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { checkedOutNow, sceneCtaState } from '../lib/attendanceState'
import { CHECK_OUT_CONSEQUENCE, STAY_LABEL, checkOutQuestion } from '../lib/switchCopy'

const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

describe('the check-out question', () => {
  it('names the event when it has one, and says "this event" otherwise', () => {
    expect(checkOutQuestion('Vinyl Night')).toBe('Check out of Vinyl Night?')
    expect(checkOutQuestion(null)).toBe('Check out of this event?')
    expect(checkOutQuestion('  ')).toBe('Check out of this event?')
    expect(STAY_LABEL).toBe('Stay')
  })

  it.each(['components/blendn/BlendnScreen.tsx', 'app/(tabs)/events.tsx', 'components/scene/EventHold.tsx'])('%s asks with the shared words, not its own copy', (f) => {
    const s = src(f)
    expect(s).toContain('CHECK_OUT_CONSEQUENCE')
    expect(s).toContain('checkOutQuestion(')
    expect(s).not.toContain('You’ll leave the room and its people')
  })

  it('the consequence is the room’s sentence', () => {
    expect(CHECK_OUT_CONSEQUENCE).toBe('You’ll leave the room and its people. To come back in you’ll need to check in again, with your location.')
  })
})

describe('counted out on the yes (C-2)', () => {
  const live = { phase: 'live' as const, rsvpStatus: 'going', attended: true }
  it('is no longer "going", so the dock flips and the sheet (shown only while going) leaves in the same frame', () => {
    const before = { success: true, checked_in: true, status: 'checked_in' }
    const after = checkedOutNow(before)
    expect(sceneCtaState({ ...live, checkedIn: before.checked_in })).toBe('going')
    expect(after).toEqual({ success: true, checked_in: false, status: 'checked_out' })
    expect(sceneCtaState({ ...live, checkedIn: after!.checked_in })).not.toBe('going')
    expect(before.checked_in).toBe(true)
  })
  it('leaves an unknown status unknown', () => {
    expect(checkedOutNow(null)).toBeNull()
  })
  it('the event page wires it: the check-out’s yes sets the page’s status through checkedOutNow', () => {
    expect(src('components/screens/EventDetailScreen.tsx')).toMatch(/onCheckedOut:\s*\(\)\s*=>\s*setCheckInStatus\(checkedOutNow\)/)
  })
})
