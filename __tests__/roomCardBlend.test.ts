/**
 * A Blend's members open the room card, as a crew's do (SCRUM-901). `senderTappable` excluded `blend`, so a tap on a
 * member's avatar, name or bubble did nothing. The card answers a handle with the pseudonym: no photo, no bio.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { opensRoomCard, roomCardRoute } from '../lib/roomCard'
import { roomMessagesFrom, roomPhotosAllowed } from '../lib/roomMessages'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('which rooms open the room card', () => {
  it.each(['crew', 'blend'])('%s: the room card', (kind) => expect(opensRoomCard(kind)).toBe(true))
  it.each(['event', 'board_post', null, undefined])('%s: not the room card (an event keeps the in-room card)', (kind) =>
    expect(opensRoomCard(kind)).toBe(false))

  it('routes a Blend sender to /user/[id] with the pseudonym and the room seed', () => {
    expect(roomCardRoute({ id: 'h1', name: 'Quiet Fox' }, 'room1')).toEqual({
      pathname: '/user/[id]',
      params: { id: 'h1', pseudonym: 'Quiet Fox', roomSeed: 'room1:h1' },
    })
  })
})

describe('the room screens use it', () => {
  const screen = read('app/chat/[id].tsx')
  it('a tap on a sender is enabled and routed for a Blend', () => {
    expect(screen).toMatch(/senderTappable=\{eventRoom \|\| opensRoomCard\(roomKind\)\}/)
    expect(screen).toMatch(/opensRoomCard\(roomKind\) \? router\.push\(roomCardRoute\(sender, roomId\)/)
  })
  it('Room info routes a Blend member the same way', () => {
    expect(read('app/chat-info/[id].tsx')).toMatch(/opensRoomCard\(row\?\.kind\) \? router\.push\(roomCardRoute/)
  })
})

describe('a Blend never draws a photo', () => {
  it('the photo gate is a crew only', () => {
    expect(roomPhotosAllowed('blend')).toBe(false)
  })
  it('history drops the image a server sends for a Blend room', () => {
    const [m] = roomMessagesFrom([{ id: 'm1', sender_id: 'h1', user: { name: 'Quiet Fox', image: 'https://x/p.jpg' }, content: 'hi' }], 'me', 'blend')
    expect(m.sender_image).toBeUndefined()
  })
})
