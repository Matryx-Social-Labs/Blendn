/*
 * The three conditions on the warning, and the two states of the banner.
 *
 * Worth testing because the failure modes are asymmetric. A warning that fires
 * too often trains people to dismiss it, which costs nothing the first time and
 * everything on the day it matters. A warning that fires too rarely means
 * somebody's name and face were in a room they did not picture.
 */

import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { VisibilityBanner } from '../components/ds/Banner'
import {
  PUBLIC_CHECKIN_WARNING,
  bannerState,
  roomVisibility,
  shouldWarnBeforePublicCheckIn,
} from '../lib/roomVisibility'

describe('roomVisibility', () => {
  it('maps the server flag to a state', () => {
    expect(roomVisibility(true)).toBe('named')
    expect(roomVisibility(false)).toBe('anonymous')
  })

  it('"Show online status" off outranks reveal — a name nobody is shown is not a state', () => {
    // SCRUM-141: off means counted and not listed, on the roster and the grid.
    expect(roomVisibility(true, false)).toBe('hidden')
    expect(roomVisibility(false, false)).toBe('hidden')
    expect(roomVisibility(false, true)).toBe('anonymous')
  })
})

describe('bannerState', () => {
  it('hidden outranks everything; named; anonymous with a way to reveal; blocked with nothing to reveal', () => {
    expect(bannerState(true, false, true)).toBe('hidden')
    expect(bannerState(true, true, false)).toBe('named')
    expect(bannerState(false, true, true)).toBe('anon')
    expect(bannerState(false, true, false)).toBe('blocked')
  })

  it('NEVER blocks going anonymous: named stays named whatever the profile', () => {
    expect(bannerState(true, true, false)).toBe('named')
  })
})

describe('the visibility line (ds VisibilityBanner)', () => {
  const text = async (state: 'named' | 'anon' | 'hidden' | 'blocked', name?: string, missing?: string) => {
    await render(<VisibilityBanner state={state} name={name} missing={missing} onAction={() => {}} />)
    return screen
  }

  it('names the setting and offers the way to it, in the first person, when hidden', async () => {
    const s = await text('hidden')
    expect(s.getByText(/^You’re not listed here/)).toBeTruthy()
    expect(s.getByText(/Show online status/)).toBeTruthy()
    expect(s.getByRole('button', { name: 'Turn it on' })).toBeTruthy()
  })

  it('only ever describes you, never anyone else', async () => {
    for (const [state, name] of [['named', 'Sam'], ['anon', 'Cosmic Panda'], ['anon', undefined], ['hidden', undefined], ['blocked', undefined]] as const) {
      const s = await text(state, name)
      const line = s.getByText(/^You’re/).props.children as string
      expect(line).not.toMatch(/\b\d+\s+(people|others|revealed)\b/i)
    }
  })

  it('names the pseudonym when anonymous, and still says something before it is known', async () => {
    expect((await text('anon', 'Cosmic Panda')).getByText(/as Cosmic Panda/)).toBeTruthy()
    const s = await text('anon')
    expect(s.getByText(/^You’re anonymous in this room/)).toBeTruthy()
    expect(s.queryByText(/undefined|null/)).toBeNull()
  })

  it('says what is visible when named, and offers the opposite state, both ways', async () => {
    const named = await text('named', 'Sam')
    expect(named.getByText(/with your photo/)).toBeTruthy()
    expect(named.getByRole('button', { name: 'Go anonymous' })).toBeTruthy()
    expect((await text('anon', 'Night Cat')).getByRole('button', { name: 'Show who I am' })).toBeTruthy()
  })

  it('blocked says why on screen, with what is missing, and offers the fix rather than a reveal', async () => {
    const s = await text('blocked', undefined, 'a name and a photo')
    expect(s.getByText(/Add a name and a photo to your profile first/)).toBeTruthy()
    expect(s.getByRole('button', { name: 'Add a name and a photo' })).toBeTruthy()
    expect(s.queryByRole('button', { name: 'Show who I am' })).toBeNull()
  })
})

describe('shouldWarnBeforePublicCheckIn', () => {
  const base = { revealByDefault: true, hasSeenWarning: false, canReveal: true }

  it('warns on the first public check-in', () => {
    expect(shouldWarnBeforePublicCheckIn(base)).toBe(true)
  })

  it('does not warn someone entering anonymously', () => {
    // Nothing is being exposed, and a dialog on the safe path is how people
    // learn to dismiss dialogs without reading them.
    expect(shouldWarnBeforePublicCheckIn({ ...base, revealByDefault: false })).toBe(false)
  })

  it('warns once, not every time', () => {
    // The banner carries the message from then on, and it does it better —
    // continuously, in the room, rather than once at the door.
    expect(shouldWarnBeforePublicCheckIn({ ...base, hasSeenWarning: true })).toBe(false)
  })

  it('does not warn when there is nothing to reveal', () => {
    /*
     * No name and no photo means revealing shows *nothing* — the card is
     * byte-for-byte what it was. Warning about an exposure that cannot happen
     * is the same class of mistake as `lib/reveal.ts` was written to avoid.
     */
    expect(shouldWarnBeforePublicCheckIn({ ...base, canReveal: false })).toBe(false)
  })
})

describe('the warning copy', () => {
  it('names both things that become visible', () => {
    expect(PUBLIC_CHECKIN_WARNING.title).toContain('name')
    expect(PUBLIC_CHECKIN_WARNING.title).toContain('photo')
  })

  it('says the scope is this room, not everywhere', () => {
    // Someone who thinks it is a global switch will either refuse it or be
    // surprised later, and both are worse than a longer sentence.
    expect(PUBLIC_CHECKIN_WARNING.body).toMatch(/this room/i)
  })

  it('offers staying anonymous as a real choice, not a dismissal', () => {
    // "Cancel" reads as "go back"; "Stay anonymous" reads as a decision. On a
    // consent dialog the difference is whether the safe option looks like one.
    expect(PUBLIC_CHECKIN_WARNING.cancel).toMatch(/anonymous/i)
  })
})
