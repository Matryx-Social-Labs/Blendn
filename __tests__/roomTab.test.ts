import {
  blendnClosed,
  openBlendn,
  openRoomChat,
  setLiveHint,
  setLiveRoomChat,
  takePendingTab,
} from '../lib/blendnOverlay'
import { chatOpensInRoom, chatTabBadge, chatTabLabel } from '../lib/roomTab'

/**
 * Flow 5 C1 (R-A): one room, People | Chat. The disc opens People; "Open the
 * room", a push, a link and the Lobby handover open Chat. Every one of those
 * reaches `chat/[id]`, so that route is the one place that decides (the
 * overlay's Chat tab, or the chat screen for a room that is not the overlay's).
 */
describe('the room tab an entry opens', () => {
  beforeEach(() => {
    blendnClosed()
    setLiveRoomChat(null)
  })

  it('opens People from the disc', () => {
    openBlendn()
    expect(takePendingTab()).toBe('people')
  })

  it('opens Chat for the room chat, once', () => {
    openRoomChat()
    expect(takePendingTab()).toBe('chat')
    // Taken: a later re-render of the room does not snap back to Chat.
    expect(takePendingTab()).toBe('people')
  })

  it('a person from a wave still opens People', () => {
    openBlendn('u1')
    expect(takePendingTab()).toBe('people')
  })

  it('closing forgets a tab that was asked for', () => {
    openRoomChat()
    blendnClosed()
    expect(takePendingTab()).toBe('people')
  })
})

describe('which chat opens in the room', () => {
  beforeEach(() => {
    setLiveHint(null)
    setLiveRoomChat(null)
  })

  // The overlay is mounted only while open: a push, the event page or the Banter row arrive with it closed.
  it('with the room closed, the room of the event you are checked in to opens as the Chat tab', () => {
    setLiveHint('e1', 'Design festival')
    expect(chatOpensInRoom({ id: 'g1', eventId: 'e1' })).toBe(true)
    // Controls: another event's room, and a link that names no event before the Room has ever said its chat.
    expect(chatOpensInRoom({ id: 'g2', eventId: 'e2' })).toBe(false)
    expect(chatOpensInRoom({ id: 'g1' })).toBe(false)
  })

  it('the chat the Room said outlives the overlay, and goes when you are checked in somewhere else or nowhere', () => {
    setLiveHint('e1')
    setLiveRoomChat('g1')
    expect(chatOpensInRoom({ id: 'g1' })).toBe(true)
    setLiveHint('e2')
    expect(chatOpensInRoom({ id: 'g1' })).toBe(false)
    setLiveRoomChat('g1')
    setLiveHint(null)
    expect(chatOpensInRoom({ id: 'g1' })).toBe(false)
  })

  it('the live room’s own chat opens as the Chat tab', () => {
    setLiveRoomChat('g1')
    expect(chatOpensInRoom({ id: 'g1' })).toBe(true)
    expect(chatOpensInRoom({ id: 'g1', eventId: 'e1' })).toBe(true)
  })

  // Controls: anything else stays the chat screen.
  it('another event’s room, or with no live room, stays a screen', () => {
    expect(chatOpensInRoom({ id: 'g1' })).toBe(false)
    setLiveRoomChat('g1')
    expect(chatOpensInRoom({ id: 'g2' })).toBe(false)
  })

  it('a crew’s, a Blend’s or a board post’s room is never the overlay’s', () => {
    setLiveRoomChat('g1')
    for (const kind of ['crew', 'blend', 'board_post']) expect(chatOpensInRoom({ id: 'g1', kind })).toBe(false)
    expect(chatOpensInRoom({ id: 'g1', kind: 'event' })).toBe(true)
  })
})

describe('the Chat tab’s badge', () => {
  it('is exact to 9, then 9+, and absent at 0', () => {
    expect(chatTabBadge(0)).toBeNull()
    expect(chatTabBadge(3)).toBe('3')
    expect(chatTabBadge(9)).toBe('9')
    expect(chatTabBadge(10)).toBe('9+')
    expect(chatTabBadge(12480)).toBe('9+')
  })

  it('is spoken with the tab', () => {
    expect(chatTabLabel(0)).toBe('Chat')
    expect(chatTabLabel(1)).toBe('Chat, 1 new')
    expect(chatTabLabel(9)).toBe('Chat, 9 new')
    expect(chatTabLabel(10)).toBe('Chat, 9 or more new')
  })
})
