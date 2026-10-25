import { readFileSync } from 'fs'
import { join } from 'path'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('Nearby events', () => {
  const SRC = read('app', 'nearby-events.tsx')

  it('says the day as well as the time on each card', () => {
    // "9:00 PM" alone could be any night; the card's time is the one date grammar (`cardTime`: "Sat · 10:30 PM").
    expect(SRC).toContain('homeCardProps(')
    expect(SRC).not.toContain('formatTimeRange(')
  })

  it('tells a failed location fix apart from an empty city, with a Try again', () => {
    expect(SRC).toContain('Location unavailable')
    expect(SRC).toMatch(/onPress: retryLocation/)
  })

  it('tries again on returning from Settings while denied, without re-prompting', () => {
    expect(SRC).toMatch(/AppState\.addEventListener\('change'/)
    expect(SRC).toContain('Location.getForegroundPermissionsAsync()')
  })

  it('offers a way on from the empty state', () => {
    expect(SRC).toContain('Browse events')
  })
})

describe('Connect in the room', () => {
  const ROOM = read('lib', 'useRoom.ts')
  const SCREEN = read('components', 'blendn', 'BlendnScreen.tsx')

  it('marks a person requested only when the request stands', () => {
    const connect = ROOM.slice(ROOM.indexOf('const connect = useCallback'), ROOM.indexOf('const remove = useCallback'))
    // Success, or the CONFLICT saying one already exists — never in a `finally`.
    expect(connect).toMatch(/const stands = !!result\.success \|\| result\.errorCode === 'CONFLICT'/)
    expect(connect).toMatch(/if \(stands\) setRequested/)
    expect(connect).not.toMatch(/finally/)
  })

  it('checks the answer, says so on failure, and always stops the spinner', () => {
    const onSend = SCREEN.slice(SCREEN.indexOf('onSend={async'), SCREEN.indexOf('<MomentMatch'))
    expect(onSend).toMatch(/if \(await room\.connect\(connectTo\.id, message\)\) setConnectTo\(null\)/)
    expect(onSend).toContain("say('Couldn’t send the request. Try again.', 'error')")
    expect(onSend).toMatch(/finally \{\s*setConnecting\(false\)/)
  })

  it('never prints the raw load error on the room', () => {
    // A failed room is a quiet line over Tonight in fixed words (Flow 4 Room #15).
    expect(SCREEN).not.toMatch(/\{room\.error/)
    expect(read('components', 'blendn', 'TonightView.tsx')).toContain('Couldn’t check your room. You can still browse tonight.')
  })
})

describe('the Blend’n overlay is modal to assistive tech', () => {
  const LAYOUT = read('app', '(tabs)', '_layout.tsx')

  it('hides the tabs underneath while it is open', () => {
    expect(LAYOUT).toMatch(/accessibilityElementsHidden=\{blendnOpen\}/)
    expect(LAYOUT).toMatch(/importantForAccessibility=\{blendnOpen \? 'no-hide-descendants' : 'auto'\}/)
    expect(LAYOUT).toMatch(/accessibilityViewIsModal[\s\S]{0,80}<BlendnScreen \/>/)
  })
})
