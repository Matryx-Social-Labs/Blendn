import { readFileSync } from 'fs'
import { join } from 'path'


/**
 * The Scene's CTA — the numbers, and the structural rules behind them.
 *
 * Source-text assertion rather than rendering, for the same reason
 * `pulseNav.test.ts` is: these are layout and accessibility facts that typecheck
 * identically when wrong. Colour, blur, shadow and type-scale choices are not
 * pinned here; `npm run lint:design` enforces them.
 */
/** Any repo file, by path segments. */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

/**
 * The *shipping* screen, which is a different component from `SceneCTA`.
 *
 * `EventDetailScreen` does not use `SceneCTA` and should not: its action is a
 * three-stage morph (check in → checked in → go to chat) with loading states
 * and a secondary check-out/RSVP button beside it. `SceneCTA` is the simpler
 * control. Replacing one with the other would lose behaviour.
 *
 * What they do have to agree on is the *language*, and nothing enforced that —
 * the harness said "Blend’n" while the real button said "Blend'n", and the
 * only way to notice was to sign in and look.
 */
const DETAIL = () =>
  readFileSync(
    join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'),
    'utf8'
  )

describe('the event screen IS the Scene now, and kept what the CTA lacks', () => {
  /*
   * This block used to guard the gap between the harness and the shipping
   * screen: `app/event/[id].tsx` rendered a hand-built morphing action row
   * while `components/scene/*` was reachable only from `app/preview/scene.tsx`.
   * The gap is closed — the screen renders `SceneCTA` — so these assertions
   * move to the new structure rather than being deleted. Each keeps its intent.
   */
  it('labels the check-in action with the product name, never the retired verb', () => {
    // Owner 2026-11-05 (naming review, SCRUM-1027): the check-in is "Hold to Blend’n", the hold in the dock at the doors.
    const hold = read('components', 'scene', 'EventHold.tsx')
    expect(hold).toContain("'Hold to Blend’n'")
    expect(hold).not.toMatch(/[lL]abel=\{[^}]*blend in/i)
  })

  it('has one pill and no tray behind it', () => {
    /*
     * The old `tabBar` was a translucent tray with its own fill, hairline and
     * radius, holding buttons that each already carried a BlurView and a sheen
     * — two nested sheets reading as a smudge with two outlines, neither of
     * which is the thing you press.
     *
     * The screen has no action row at all now, which satisfies this by
     * construction; asserting the absence keeps a future rewrite from
     * reintroducing one.
     */
    const detail = DETAIL()
    expect(detail).not.toContain('tabBar: {')
    expect(detail).not.toContain('glassButtonBlur')
  })

  it('keeps the behaviour SceneCTA does not have', () => {
    /*
     * THE test, and it has now caught three separate versions of the same
     * mistake while this screen was rewritten:
     *
     *   1. check out moved into an overflow tray -- two taps behind an
     *      ellipsis, for the most time-sensitive action in the app
     *   2. RSVP put a "..." in the top bar, a control the design never asked
     *      for in the screen's most prominent slot
     *   3. the secondary row deleted, taking check out's only caller with it
     *
     * The settled answer: the CTA is **one slot whose subject changes with the
     * clock**, so there is no second control on this screen at all. RSVP is
     * the CTA before the doors; check in is the CTA after; check out lives in
     * the room the CTA opens.
     */
    const detail = DETAIL()

    // The CTA is time-aware. "Blend’n" before the event cannot succeed --
    // check-in requires the event to be running -- so it must not be offered.
    // One state for every surface (`lib/attendanceState.ts`, SCRUM-882): upcoming → the RSVP slot, live → Blend in.
    expect(detail).toContain('sceneCtaState({ phase: event ? attendancePhase(event)')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sceneCtaState } = require('../lib/attendanceState') as typeof import('../lib/attendanceState')
    expect(sceneCtaState({ phase: 'upcoming', rsvpStatus: null, checkedIn: false, attended: false })).toBe('rsvp')
    expect(sceneCtaState({ phase: 'live', rsvpStatus: null, checkedIn: false, attended: false })).toBe('join')
    expect(detail).toContain('handleToggleRsvp')

    // A thrown RSVP request puts the old status back. The optimistic
    // "You're going" used to survive a timeout with no row behind it —
    // `prevStatus` lived inside the `try`, so the `catch` could not reach it.
    const handler = detail.slice(detail.indexOf('const handleToggleRsvp'), detail.indexOf('}, [id, user, rsvpStatus'))
    expect(handler).toMatch(/const prevStatus = rsvpStatus\s*\n(?:\s*(?:if \(rsvpInFlight\.current\) return|let sent = false)\s*\n)*\s*try \{/)
    expect(handler).toMatch(/\} catch \{\s*setRsvpStatus\(prevStatus\)/)

    // No second control, and no overflow in the bar.
    expect(detail).not.toContain('secondaryRow')
    expect(detail).not.toContain('ellipsis-horizontal')

    // The check-in is this page's hold (SCRUM-966): the one flow, `useEventCheckIn`, with no pass docked in Blend'n first.
    expect(detail).not.toContain('checkingIn')
    expect(detail).toContain('useEventCheckIn(')
    expect(detail).not.toContain('openPass(')
  })

  it('check out really is where this screen says it moved to', () => {
    /*
     * The Scene stopped carrying check out on the grounds that its CTA opens
     * the room and the room has it. That is only true while the room does --
     * so the claim is asserted rather than trusted, and this fails the day
     * somebody tidies the room's top bar. The room is the Blend'n overlay now,
     * and its Check out goes through `useRoomControls`.
     */
    const room = read('components', 'blendn', 'BlendnScreen.tsx')
    expect(room).toContain('controls.checkOut()')
    expect(room).toContain('Check out')
    expect(read('lib', 'useRoomControls.ts')).toContain('checkOutOf(eventId)')
  })

  it('renders the rebuilt Scene rather than a second implementation of it', () => {
    // The whole point of the swap. If this fails, something has grown a
    // parallel Scene again — which is how the last one went unnoticed.
    const detail = DETAIL()
    for (const c of ['SceneHero', 'SceneBar', 'EventGuide', 'DockRow', 'Dock']) {
      expect(detail).toContain(c)
    }
  })
})

describe('the Scene is a full-screen route', () => {
  /*
   * Pinned because it was lost twice — once by shipping the rebuilt screen into
   * the sheet the old one used, and once by a `git reset --hard` that discarded
   * the fix after it had been verified on device.
   *
   * A sheet insets from the top, rounds its corners and leaves the previous
   * screen visible above it. Frame `1141:4853` is a full-bleed artboard whose
   * hero dissolves into the page, and the design deliberately removed a
   * bottom-sheet panel from *inside* this screen — presenting the whole screen
   * as a sheet puts that shape straight back, one level up.
   */
  const layout = () => read('app', '_layout.tsx')

  it('presents /event/[id] as a card, never a modal', () => {
    const src = layout()
    const block = src.slice(src.indexOf('name="event/[id]"'))
    const options = block.slice(0, block.indexOf('/>'))
    expect(options).toContain("presentation: 'card'")
    expect(options).not.toContain("presentation: 'modal'")
  })

  it('does not zero the top inset, which only a sheet needs', () => {
    /*
     * `topInset={0}` is correct inside a sheet — iOS has already cleared the
     * notch, so the shared bar would pad by it twice. On a full-screen route it
     * is the opposite error: the bar rides up under the status bar.
     */
    expect(DETAIL()).not.toContain('topInset={0}')
  })
})

describe('the check-in position request has a deadline', () => {
  it('rejects with E_LOCATION_TIMEOUT rather than spinning for ever', () => {
    /*
     * getCurrentPositionAsync has no timeout option and BestForNavigation
     * waits for a fresh fix; on an emulator with no GPS stream the Blend in
     * button spun for five minutes and the "Location timeout" tray, written
     * for exactly this, could never show.
     */
    // The fix moved to `lib/locationFix.ts`, shared by the event screen and
    // the Blend'n room through `lib/useCheckInFlow.ts`.
    const src = readFileSync(join(__dirname, '..', 'lib', 'locationFix.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).toContain("code: 'E_LOCATION_TIMEOUT'")
    expect(src).toMatch(/export const LOCATION_FIX_TIMEOUT_MS = 1[0-9]_000/)
    expect(src).not.toContain('timeInterval: 12000')
  })
})
