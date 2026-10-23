import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Banter — the rules that outlived its redesign (Flow 5, 2026-10-15).
 *
 * The screen is drawn by `app/(tabs)/chat.tsx` and `components/banter/BanterParts.tsx`;
 * its data — rooms, crew chats, DMs, requests, loaded together and kept live —
 * by `lib/useBanterInbox.ts`. Behaviour is rendered in `banterScreen.test.tsx`;
 * these pin the decisions a render with fixtures can't reach.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/*
 * Strip comments before matching: twice a test passed by matching its own
 * explanatory prose after the code was deleted.
 */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The request card moved to one row both the strip and the See all screen draw. */
const REQUEST_ROW = () => stripComments(read('components/banter/RequestRow.tsx'))
const SCREEN = () => stripComments(read('app/(tabs)/chat.tsx'))
const PARTS = () => stripComments(read('components/banter/BanterParts.tsx'))
const INBOX = () => stripComments(read('lib/useBanterInbox.ts'))

describe('one inbox, not two tabs', () => {
  it('keeps no tab state and no segmented control', () => {
    const src = SCREEN() + INBOX()
    expect(src).not.toContain('activeTab')
    expect(src).not.toContain('setActiveTab')
  })

  it('fetches both lists in the same pass', () => {
    const src = INBOX()
    const block = src.slice(src.indexOf('if (shouldFetchList)'))
    const body = block.slice(0, block.indexOf('lastFetchRef.current.list'))
    expect(body).toContain('Promise.all')
    expect(body).toContain('loadGroupChats')
    expect(body).toContain('loadPersonalChats')
  })

  it('sorts by last message with never-used conversations last', () => {
    const src = SCREEN()
    expect(src).toContain('sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0')
    expect(src).toContain('const byRecent = (a: Row, b: Row) => b.sortTime - a.sortTime')
  })

  it('draws a person round and a room or crew square (one avatar family)', () => {
    const src = SCREEN()
    expect(src).toContain("face: { kind: 'person',")
    expect(src).toContain("face: { kind: 'room', cover: c.event_image }")
    expect(src).toContain("face: { kind: 'crew', seed: crews.seedFor(r.id) }")
    expect(PARTS()).toContain('borderRadius: SQUARE_RADIUS')
  })

  it('namespaces the id spaces so a collision cannot drop a row', () => {
    const src = SCREEN()
    expect(src).toContain('key: `p:${c.conversation_id}`')
    expect(src).toContain('key: `g:${c.chat_room_id}`')
    expect(src).toContain('key: `c:${r.id}`')
  })

  it('groups into Crews, People and Past rooms under one heading system', () => {
    const src = SCREEN()
    expect(src).toContain("['Crews', match(crewRows), false]")
    expect(src).toContain("['People', match(peopleRows), true]")
    expect(src).toContain("['Past rooms', match(pastRows), false]")
    expect(src).toContain('<SectionHeader')
  })
})

describe('message requests', () => {
  it('still load, and are still answerable', () => {
    expect(INBOX()).toContain('loadMessageRequests')
    expect(REQUEST_ROW()).toContain("inbox.respondToRequest(r, 'accept')")
    expect(REQUEST_ROW()).toContain("inbox.respondToRequest(r, 'decline')")
    expect(SCREEN()).toContain('<RequestRow')
  })

  it('show the note verbatim, in two lines (ROUND3 C11)', () => {
    expect(REQUEST_ROW()).toContain('note={r.initial_message?.trim() ||')
    expect(PARTS()).toMatch(/numberOfLines=\{2\}[^>]*>\s*\{note\}/)
  })

  it('put Decline before Accept, at 48, and hold both while one is in flight', () => {
    const parts = PARTS()
    const actions = parts.slice(parts.indexOf('styles.requestActions'))
    expect(actions.indexOf('label="Decline"')).toBeLessThan(actions.indexOf('label={accept}'))
    expect(actions).toContain('disabled={pending}')
    expect(actions).toContain('loading={pending}')
    expect(actions.match(/size="md"/g)).toHaveLength(2)
  })

  it('Accept has no press haptic: H.success comes with the answer', () => {
    expect(PARTS()).toContain('pressHaptic={false}')
    expect(INBOX()).toMatch(/action === 'accept'[\s\S]{0,80}H\.success\(\)/)
  })

  it('leave with a fade while the rest close the gap', () => {
    const src = SCREEN()
    expect(src).toContain('exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)}')
    expect(src).toContain('layout={reduceMotion ? undefined : REQUEST_REFLOW}')
  })

  it('show crew invites as requests, with Join opening the invite, which holds the consent (R2-D2 #02)', () => {
    const src = SCREEN()
    expect(src).toContain('accept="Join"')
    expect(src).toContain("pathname: '/crews/invite/[crewId]'")
    expect(src).toContain('crews.decline(invite)')
  })
})

describe('the list is still a list', () => {
  it('renders through one FlatList, the live room and requests riding its header', () => {
    const src = SCREEN()
    expect(src).toContain('<FlatList')
    expect(src).toContain('ListHeaderComponent={header}')
  })

  it('tells loading, a search that found nothing, a failure and empty apart', () => {
    const src = SCREEN()
    expect(src).toMatch(/inbox\.loading \? \(\s*<BanterSkeleton \/>/)
    expect(src).toContain('title={`No chats match “${query.trim()}”`}')
    expect(src).toContain('title="Couldn’t load your chats"')
    expect(src).toContain('title="No conversations yet"')
    // Live rooms or requests with nothing else is not an empty inbox.
    expect(src).toContain('hasHeaderContent ? null : (')
  })

  it('recycles covers by key', () => {
    expect(PARTS()).toContain('recyclingKey={face.cover}')
    expect(PARTS()).toContain('recyclingKey={coverUrl}')
  })
})

describe('the room you are standing in', () => {
  it('is decided by the server, not inferred from the clock', () => {
    expect(INBOX()).toContain('is_checked_in: room.isCheckedIn === true')
  })

  it('appears once — as the hero, not also in Past rooms', () => {
    const src = SCREEN()
    expect(src).toContain('rooms.filter((c) => c.is_checked_in)')
    expect(src).toContain('.filter((c) => !c.is_checked_in)')
  })

  it('shows the room count from `memberCount`, rolling', () => {
    expect(INBOX()).toContain('participant_count: roomMemberCount(room) ?? 0')
    // Five and up, as every people count says it (the owner's floor).
    expect(SCREEN()).toContain('count={printable(c.participant_count) ?? 0}')
    expect(PARTS()).toContain('<RollingNumber value={count}')
  })

  it('says a locked room as a status, not as speech (Flow 5 #08)', () => {
    expect(SCREEN()).toContain("'Locked by the organiser · read only'")
    expect(SCREEN()).toContain("const stateLine = roomStateLine(c.room_state)")
    expect(SCREEN()).toContain("{ kind: 'chip', icon: c.room_state === 'locked' ? 'lock' : 'mic-off', text: stateLine, warn: c.room_state === 'locked' }")
  })
})

describe('a row is one height, read or unread', () => {
  it("reserves the unread dot’s slot on every row", () => {
    const parts = PARTS()
    expect(parts).toContain('<View style={styles.dotSlot}>')
    expect(parts).toContain('<PresenceDot kind="unread" />')
  })

  it('marks unread in three changes: the line white and medium, the time white, the dot', () => {
    const parts = PARTS()
    expect(parts).toContain('unread ? FONT_FAMILY.brand[500] : undefined), unread ? styles.ink : styles.secondary')
    expect(parts).toContain('unread ? styles.ink : styles.tertiary')
  })
})

describe('a match is anonymous until they reveal', () => {
  it('carries the reveal state, and defaults an absent flag to revealed', () => {
    expect(INBOX()).toContain('they_revealed: conv.theyRevealed !== false')
    expect(INBOX()).not.toContain('theyRevealed === true')
  })

  it('draws their creature, seeded on the pseudonym, until they reveal', () => {
    expect(SCREEN()).toContain("face: { kind: 'person', photo: c.they_revealed ? c.other_user_avatar : null, pseudonym: c.other_user_name }")
  })

  it('names an unknown person the way the server does', () => {
    expect(INBOX()).toContain("|| 'Someone'")
    expect(INBOX() + SCREEN()).not.toContain("|| 'Unknown'")
  })

  it('tells you someone asked to reveal, as a chip, until you open the thread', () => {
    const src = SCREEN()
    expect(src).toContain('c.reveal_requested && !revealSeen.has(c.conversation_id)')
    expect(src).toContain("{ kind: 'chip', icon: 'eye', text: 'Asked to reveal names' }")
  })
})

describe('what the API already sends is read', () => {
  it('reads room unread, sender and cover from the group payload', () => {
    const src = INBOX()
    expect(src).toContain('room.unreadCount')
    expect(src).toContain('last_sender_name: room.lastMessage?.user?.name || undefined')
    expect(src).toContain('room.event?.coverImageUrl')
    expect(SCREEN()).toContain('unread: c.unread_count > 0')
  })

  it('knows when the last DM was yours', () => {
    expect(INBOX()).toContain('conv.lastMessage.senderId === userId')
    expect(SCREEN()).toContain('previewWithSender(c.last_message, { fromMe: c.last_message_from_me })')
  })

  it('bumps a room it is not showing when someone else writes in it', () => {
    const src = INBOX()
    expect(src).toContain('const bump = !isFromMe && openRoomRef.current !== data.chatGroupId')
    expect(src).toContain('unread_count: bump ? updated[idx].unread_count + 1 : updated[idx].unread_count')
  })

  it('offers Mark all read for DMs only — no endpoint marks a room read', () => {
    const src = SCREEN()
    expect(src).toContain('const hasUnread = personalChats.some((c) => c.unread_count > 0)')
    expect(src).toContain("action={item.markAll && hasUnread ? { label: 'Mark all read'")
    expect(src).toContain('canMarkAll={hasUnread}')
  })

  it('searches the room sender too', () => {
    expect(SCREEN()).toContain("${c.last_sender_name ?? ''}")
    expect(SCREEN()).toContain('rows.filter((r) => r.searchText.includes(trimmed))')
  })

  it('formats no date through the device locale', () => {
    expect(SCREEN() + PARTS()).not.toContain('toLocaleDateString')
  })
})

describe('R3-D5 on the Banter', () => {
  it('5.6: a row never previews a sponsored message', () => {
    expect(SCREEN()).toContain('const sponsored = c.last_message === SPONSORED')
    expect(INBOX()).toContain('previewText(rawText) ?? SPONSORED')
  })

  it('5.8: not sent, then a draft, then the last message', () => {
    expect(SCREEN()).toContain('const held = outboxLine(outbox, thread)')
  })

  it('5.11: a room row swipes to Mute and Leave, a DM to Mark read only, a muted DM never exists', () => {
    const src = SCREEN()
    expect(src).toContain("{ icon: 'log-out', label: 'Leave', destructive: true, onPress: () => setLeaveFor(c.chat_room_id) }")
    expect(src).toContain("[{ icon: 'check-check', label: 'Mark read', onPress: () => void markRead(c) }]")
    expect(src).toContain('muted: false,')
  })
})

describe('inbox helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { inboxTimeLabel, previewWithSender, previewText } = require('../components/banter/inbox')
  // Wednesday 1 October 2026, 15:00 local.
  const now = new Date(2026, 9, 1, 15, 0, 0)
  const at = (...a: number[]) => new Date(a[0], a[1], a[2], a[3] ?? 12, a[4] ?? 0)

  it('labels times short', () => {
    expect(inboxTimeLabel(new Date(now.getTime() - 20 * 1000), now)).toBe('now')
    expect(inboxTimeLabel(new Date(now.getTime() + 60 * 1000), now)).toBe('now')
    expect(inboxTimeLabel(new Date(now.getTime() - 5 * 60 * 1000), now)).toBe('5m')
    expect(inboxTimeLabel(at(2026, 9, 1, 12), now)).toBe('3h')
    expect(inboxTimeLabel(at(2026, 8, 30, 23), now)).toBe('Yesterday')
    expect(inboxTimeLabel(at(2026, 8, 29), now)).toBe('Tue')
    expect(inboxTimeLabel(at(2026, 8, 25), now)).toBe('Fri')
    expect(inboxTimeLabel(at(2026, 8, 24), now)).toBe('24 Sep')
    expect(inboxTimeLabel(at(2025, 9, 4), now)).toBe('4 Oct 2025')
    expect(inboxTimeLabel(undefined, now)).toBe('')
    expect(inboxTimeLabel('not a date', now)).toBe('')
  })

  it('says who wrote the preview', () => {
    expect(previewWithSender('hi', { fromMe: true, name: 'Mika' })).toBe('You: hi')
    expect(previewWithSender('hi', { name: 'Velvet Otter' })).toBe('Velvet Otter: hi')
    expect(previewWithSender('hi', { name: '  ' })).toBe('hi')
    expect(previewWithSender('hi', {})).toBe('hi')
  })

  it('5.6: says a photo, a video and an announcement as a person would, and never an advert', () => {
    expect(previewText('[image]')).toBe('Photo')
    expect(previewText('[video]')).toBe('Video')
    expect(previewText('📢 [Announcement from Toit]\nLast call for the terrace')).toBe('Announcement · Toit: Last call for the terrace')
    expect(previewText('📣 [Sponsored]\nTwo-for-one till 11')).toBeNull()
    expect(previewText('  see you by the stairs  ')).toBe('see you by the stairs')
  })
})

describe('#27 · C12: the held order and its release', () => {
  const { heldList } = require('../components/banter/inbox')
  const rows = (...keys: string[]) => keys.map((key) => ({ key }))

  it('holds the order under a finger; the change raises "↑ New"', () => {
    // Arrange: c's message landed while the finger was down on [a, b, c].
    const live = rows('c', 'a', 'b', 'd')
    // Act
    const held = heldList(live, ['a', 'b', 'c'])
    // Assert: the held rows keep their places; d, new, sorts by its live place (3).
    expect(held.shown.map((r: { key: string }) => r.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(held.moved).toBe(true)
  })

  it('on lift the rows take the live order and the pill goes', () => {
    const live = rows('c', 'a', 'b')
    const released = heldList(live, null)
    expect(released.shown).toBe(live)
    expect(released.moved).toBe(false)
  })

  it('a held order nothing changed under raises no pill', () => {
    expect(heldList(rows('a', 'b'), ['a', 'b']).moved).toBe(false)
  })
})

describe('#27 · C12: the held order always lets go on iOS (drive 3)', () => {
  const { holdController, HOLD_MAX_MS, HOLD_RELEASE_MS, HOLD_TOUCH_MAX_MS } = require('../components/banter/hold')
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  const drive = (...events: string[]) => {
    const heard: boolean[] = []
    const c = holdController((held: boolean) => heard.push(held))
    events.forEach((e) => c.step(e))
    return { c, heard }
  }

  it('a fling whose momentumEnd never comes: released at the cap, not at the next tap', () => {
    // iOS's order: the drag cancels the raw touch, then the lift, then a glide with no end.
    const { c, heard } = drive('touchStart', 'dragBegin', 'touchEnd', 'dragEnd', 'momentumBegin')
    jest.advanceTimersByTime(HOLD_RELEASE_MS)
    expect(c.state().held).toBe(true)
    jest.advanceTimersByTime(HOLD_MAX_MS)
    expect(c.state().held).toBe(false)
    expect(heard).toEqual([true, false])
  })

  it('a finger resting on the list holds for as long as it rests (drive 5); only a lift never heard reaches the long cap', () => {
    const { c } = drive('touchStart')
    jest.advanceTimersByTime(HOLD_MAX_MS * 3)
    expect(c.state().held).toBe(true)
    jest.advanceTimersByTime(HOLD_TOUCH_MAX_MS)
    expect(c.state().held).toBe(false)
  })

  it('a lift it does hear, with no momentum: released after the short timer', () => {
    const { c } = drive('touchStart', 'dragBegin', 'dragEnd')
    jest.advanceTimersByTime(HOLD_RELEASE_MS)
    expect(c.state().held).toBe(false)
  })

  it('a fling that comes to rest: released at momentumEnd, and the cap is cleared', () => {
    const { c, heard } = drive('touchStart', 'dragBegin', 'dragEnd', 'momentumBegin', 'momentumEnd')
    expect(c.state().held).toBe(false)
    jest.advanceTimersByTime(HOLD_MAX_MS)
    expect(heard).toEqual([true, false])
  })
})

describe('#27 · C12: the hold, in a real touch’s event order', () => {
  const { holdStep, IDLE } = require('../components/banter/hold')
  const { heldList } = require('../components/banter/inbox')
  const run = (...events: string[]) => events.reduce((s, e) => holdStep(s, e), IDLE)
  const keys = (rows: { key: string }[]) => rows.map((r) => r.key)

  it('a finger resting on the list holds the order before any drag, and "↑ New" shows on a reorder', () => {
    // Arrange: the finger comes down on [a, b]; nothing scrolls.
    const s = run('touchStart')
    const held = s.held ? ['a', 'b'] : null
    // Act: b's message lands and the live order becomes [b, a].
    const view = heldList([{ key: 'b' }, { key: 'a' }], held)
    // Assert
    expect(s.held).toBe(true)
    expect(keys(view.shown)).toEqual(['a', 'b'])
    expect(view.moved).toBe(true)
  })

  it('a slow drag with no fling: the lift arms the release, the timer lets go', () => {
    const lifted = run('touchStart', 'dragBegin', 'dragEnd', 'touchEnd')
    expect(lifted).toMatchObject({ held: true, armed: true })
    expect(holdStep(lifted, 'timer')).toEqual(IDLE)
  })

  it('a fling: momentum cancels the lift’s release and holds until rest', () => {
    const gliding = run('touchStart', 'dragBegin', 'dragEnd', 'touchEnd', 'momentumBegin')
    expect(gliding).toMatchObject({ held: true, armed: false })
    expect(holdStep(gliding, 'timer').held).toBe(true)
    expect(holdStep(gliding, 'momentumEnd')).toEqual(IDLE)
  })

  it('Android’s touch cancel as the scroll view takes over is not a lift', () => {
    const s = run('touchStart', 'dragBegin', 'touchEnd')
    expect(s).toMatchObject({ held: true, dragging: true, armed: false })
  })
})
