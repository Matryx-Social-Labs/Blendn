import { readFileSync } from 'fs'
import { join } from 'path'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

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
    expect(onSend).toMatch(/const sent = await room\.connect\(connectTo\.id, message\)\s*if \(sent\.stands\) setConnectTo\(null\)/)
    // The server's sentence when it named one (TEXT_NOT_ALLOWED), else the generic line: in the sheet, under the note.
    expect(onSend).toContain("setConnectError(sent.refusal ?? 'Couldn’t send the request. Try again.')")
    expect(SCREEN).toMatch(/<ConnectSheet[\s\S]{0,400}error=\{connectError\}/)
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
