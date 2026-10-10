import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Where the crew rules meet screens too big to render here (the room chat,
 * the Room, the Banter). Each check names the defect it stops.
 */
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('crew and Blend rooms in the chat screen', () => {
  const chat = src('app/chat/[id].tsx')

  it('reads a closed crew or Blend room before the "not in this room" branch', () => {
    // A Blend answers 403 to somebody it took out; read as FORBIDDEN first (the
    // room refusals, `roomRefusalState`), that drew "You're not in this room —
    // Rejoin", a door that refuses for ever.
    const closed = chat.indexOf('roomClosedLine(roomKind, result.errorCode)')
    const forbidden = chat.indexOf('roomRefusalState(result.errorCode)')
    expect(closed).toBeGreaterThan(-1)
    expect(forbidden).toBeGreaterThan(-1)
    expect(closed).toBeLessThan(forbidden)
  })

  it('a send refused because the room closed closes the room on screen', () => {
    expect(chat.match(/roomClosedLine\(roomKind, result\.errorCode\)/g)).toHaveLength(2)
    expect(chat).toContain('<RoomClosedNotice line={closedLine}')
  })
})

describe('a crew card is counts, never people', () => {
  it('draws nothing of a person: no pseudonym, photo or member', () => {
    const parts = src('components/crews/CrewParts.tsx')
    const card = parts.slice(parts.indexOf('export function CrewCardView'), parts.indexOf('/** A face in a Blend side'))
    expect(card.length).toBeGreaterThan(100)
    expect(card).not.toMatch(/pseudonym|photo|people|members|<Face/)
  })
})

describe('the surfaces are wired', () => {
  it('the Banter lists open Blends under Live now', () => {
    const banter = src('app/(tabs)/chat.tsx')
    expect(banter).toContain('blends.map((b) =>')
    expect(banter).toContain("kind: 'blend', blendId: b.blendId")
  })

  it('the Grid has a Crews view', () => {
    const room = src('components/blendn/BlendnScreen.tsx')
    expect(room).toContain("gridView === 'crews' && eventId ? (")
    expect(room).toContain('<CrewsView eventId={eventId} crews={crews} />')
  })
})
