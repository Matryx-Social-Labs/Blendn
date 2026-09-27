import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Banter — the decisions that made the rebuild against frame `1141:5247`
 * different from the screen it replaced.
 *
 * These are source assertions rather than render assertions for the same
 * reason the rest of the suite is: the screen needs a login, a socket and a
 * conversation that exists, and none of those has anything to do with whether
 * the two lists are fetched together.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/*
 * Strip comments before matching.
 *
 * Twice now a test has passed by matching its own explanatory prose — the
 * comment above the code said the same words the assertion looked for, so the
 * assertion held after the code was deleted.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SCREEN = () => stripComments(read('app/(tabs)/chat.tsx'))
const SECTIONS = () => stripComments(read('components/banter/BanterSections.tsx'))
const TOP_BAR = () => stripComments(read('components/pulse/PulseTopBar.tsx'))

describe('one inbox, not two tabs', () => {
  it('keeps no tab state and no segmented control', () => {
    /*
     * The old screen carried `activeTab: 'group' | 'personal'` and branched
     * every cache key, every throttle and every fetch on it. The frame has a
     * single Recent list. If a tab comes back, the two-places-to-check problem
     * comes back with it.
     */
    const src = SCREEN()
    expect(src).not.toContain('activeTab')
    expect(src).not.toContain('ChatTabType')
    expect(src).not.toContain('setActiveTab')
  })

  it('fetches both lists in the same pass', () => {
    /*
     * The tabbed version fetched only the visible half, so the other half was
     * always as stale as the last time you looked at it. Merged, they go out
     * together — and `Promise.all` rather than sequentially, because the two
     * requests do not depend on each other.
     */
    const src = SCREEN()
    const block = src.slice(src.indexOf('if (shouldFetchList)'))
    const body = block.slice(0, block.indexOf('lastFetchRef.current.list'))
    expect(body).toContain('Promise.all')
    expect(body).toContain('loadGroupChats')
    expect(body).toContain('loadPersonalChats')
  })

  it('sorts by last message with never-used conversations last', () => {
    /*
     * `sortTime` is 0 when a conversation has never been used, and the sort is
     * descending — so an empty event room lands at the bottom rather than the
     * top. A room created five minutes ago with nothing in it is not the most
     * important thing in the inbox.
     */
    const src = SCREEN()
    expect(src).toContain('sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0')
    expect(src).toContain('merged.sort((a, b) => b.sortTime - a.sortTime)')
  })

  it('distinguishes a room from a person by kind, not by list', () => {
    // The whole visual difference in the frame: a photograph or a disc.
    const src = SCREEN()
    expect(src).toContain("kind: 'direct' as const")
    expect(src).toContain("kind: 'event' as const")
    expect(SECTIONS()).toContain("const isRoom = item.kind === 'event' || item.kind === 'group'")
  })

  it('namespaces the two id spaces so a collision cannot drop a row', () => {
    /*
     * A conversation id and a chat-room id come from different tables and
     * nothing guarantees they differ. Two rows with the same key in a FlatList
     * renders one of them.
     */
    const src = SCREEN()
    expect(src).toContain('id: `p:${c.conversation_id}`')
    expect(src).toContain('id: `g:${c.chat_room_id}`')
  })
})

describe('message requests survived the redesign', () => {
  it('still loads, still answerable', () => {
    /*
     * The frame has no slot for a request. Matching it exactly would have
     * deleted the only way to accept or decline one — the endpoint would still
     * be there and nothing would ever call it.
     */
    const src = SCREEN()
    expect(src).toContain('loadMessageRequests')
    expect(src).toContain("respondToRequest(r, 'accept')")
    expect(src).toContain("respondToRequest(r, 'decline')")
  })

  it('puts decline before accept', () => {
    // The destructive action is not the one your thumb lands on by default.
    const sections = SECTIONS()
    const actions = sections.slice(sections.indexOf('requestStyles.requestActions'))
    expect(actions.indexOf('onDecline')).toBeLessThan(actions.indexOf('onAccept'))
  })

  it('disables both buttons while one is in flight', () => {
    // Double-tapping accept posts twice and the second one 404s on a request
    // that no longer exists.
    const sections = SECTIONS()
    expect(sections).toContain('disabled={pending}')
    expect(sections).toContain('accessibilityState={{ disabled: !!pending }}')
  })
})

describe('the frame is followed, and where it is not, deliberately', () => {
  it('does not fake a pinned rail out of recency', () => {
    /*
     * The frame's rail is labelled Pinned and nothing in the product can pin
     * anything. Filling it with the most recent conversations would duplicate
     * the list directly beneath it under a label that lies.
     */
    const src = SCREEN()
    expect(src).not.toContain("title=\"Pinned\"")
  })

  it('ships no compose FAB', () => {
    /*
     * Removed by decision: a DM starts from a person, and every route to one
     * already goes through a profile. A button that opens an empty picker is a
     * second way to do a thing that has a first way.
     */
    expect(SCREEN()).not.toContain('BanterCompose')
    expect(SECTIONS()).not.toContain('BanterCompose')
    expect(SECTIONS()).not.toContain('fab:')
  })

  it('lets the top bar say which screen it is', () => {
    /*
     * Frame `1141:5351` puts "The Banter" where the Pulse's frame puts the
     * wordmark — same position, same accent, same weight. Hardcoding the
     * wordmark made every screen reusing the bar claim to be the home screen.
     */
    expect(TOP_BAR()).toContain("title = \"Blend'n\"")
    expect(TOP_BAR()).toContain('{title}')
    expect(SCREEN()).toContain('title="The Banter"')
  })

  it('draws no violet EVENT badge — a room is told apart by its square cover', () => {
    const sections = SECTIONS()
    expect(sections).not.toContain('EMBER.violet')
    expect(sections).not.toContain('BanterPinned')
    expect(sections).toContain('borderRadius: EMBER_RADIUS.sm')
  })
})

describe('the list is still a list', () => {
  it('renders through one FlatList rather than mapping in a ScrollView', () => {
    /*
     * The header — search, requests, the Recent heading — rides as
     * `ListHeaderComponent` so the conversations below it stay virtualised. A
     * hundred rows mapped inside a ScrollView mounts a hundred avatars.
     */
    const src = SCREEN()
    expect(src).toContain('<FlatList')
    expect(src).toContain('ListHeaderComponent={header}')
  })

  it('offers an empty state and a skeleton, and tells them apart', () => {
    const src = SCREEN()
    expect(src).toMatch(/ListEmptyComponent=\{\s*loading \? \(\s*<InboxSkeleton \/>/)
    expect(src).toContain('<EmptyInbox />')
  })

  it('says a search found nothing, rather than that the inbox is empty', () => {
    const src = SCREEN()
    expect(src).toContain('<BanterSearch value={query} onChangeText={setQuery} />')
    expect(src).toMatch(/trimmedQuery \? \(\s*<Text style=\{styles\.noMatches\}/)
  })

  it('recycles avatars by key', () => {
    // `expo-image` reuses native views in a FlatList; without this a row
    // paints the previous row's face for a frame. Invisible in a screenshot.
    expect(SECTIONS()).toContain('recyclingKey={item.avatarUrl ?? undefined}')
  })
})

describe('the room you are standing in', () => {
  it('is decided by the server, not inferred from the clock', () => {
    /*
     * "The event is on now" is not "I am there". Someone who never turned up,
     * or who left an hour ago, has a room whose event is mid-flight — and no
     * business in a live section. The client has no check-in state, so the
     * flag comes down with the room.
     */
    expect(SCREEN()).toContain('is_checked_in: room.isCheckedIn === true')
  })

  it('appears once — in the rail, not also in Recent', () => {
    /*
     * The rail lifts these out. Without the filter the live room is the first
     * thing in the rail and, four seconds of scrolling later, the first thing
     * in Recent as well.
     */
    const src = SCREEN()
    expect(src).toContain('groupChats.filter((c) => c.is_checked_in)')
    expect(src).toContain('...groupChats.filter((c) => !c.is_checked_in).map')
  })

  it('draws each live room as a full-width row, not a horizontal rail', () => {
    const src = SCREEN()
    expect(src).toContain('title="Live now"')
    expect(src).toContain('<BanterLiveRoom')
    expect(src).not.toContain('<ScrollView')
    const sections = SECTIONS()
    const row = sections.slice(sections.indexOf('liveRow: {'))
    const body = row.slice(0, row.indexOf('},'))
    expect(body).toContain('backgroundColor: EMBER.surfaceSunken')
    expect(body).toContain('borderRadius: EMBER_RADIUS.md')
    expect(body).toContain('padding: SPACE.lg')
  })

  it('marks presence with a still success dot, never the accent or motion', () => {
    const sections = SECTIONS()
    const dot = sections.slice(sections.indexOf('liveDot: {'))
    const body = dot.slice(0, dot.indexOf('},'))
    expect(body).toContain('backgroundColor: EMBER.success')
    expect(sections).not.toContain('Animated')
  })

  it('shows the room count from `memberCount`, which is what the server sends', () => {
    /*
     * It read `participant_count` / `participantCount` / `participants`, none
     * of which `GET /chat/groups` has ever sent, so every room had 0 people.
     */
    expect(SCREEN()).toContain('room.memberCount')
    expect(SCREEN()).toContain('memberCount={c.participant_count}')
  })
})

describe('a row is one height, read or unread', () => {
  it('reserves the unread dot\'s slot on every row', () => {
    /*
     * The dot sits under the time; a read row keeps the empty slot so reading
     * a conversation never shifts the list under your thumb.
     */
    const sections = SECTIONS()
    expect(sections).toContain('<View style={styles.unreadSlot}>')
    expect(sections).toContain('{item.unread ? <View style={styles.unreadDot} /> : null}')
    const dot = sections.slice(sections.indexOf('unreadDot: {'))
    const dotBody = dot.slice(0, dot.indexOf('},'))
    expect(dotBody).toContain('width: UNREAD_DOT')
    // Unread is neutral: the screen's one accent is Accept.
    expect(dotBody).toContain('backgroundColor: EMBER.textPrimary')
  })

  it('has no unread-only padding and no hairlines', () => {
    const sections = SECTIONS()
    expect(sections).not.toContain('rowUnread')
    expect(sections).not.toContain('hairlineWidth')
    expect(sections).toContain('minHeight: ROW_HEIGHT')
    expect(sections).toContain('export const ROW_HEIGHT = ROW_AVATAR + SPACE.md * 2')
  })

  it('keeps the preview to one line', () => {
    const sections = SECTIONS()
    const conv = sections.slice(sections.indexOf('export function BanterConversation'))
    const body = conv.slice(0, conv.indexOf('function RoomCover'))
    expect(body).toContain('numberOfLines={1}')
    expect(body).not.toContain('numberOfLines={2}')
  })
})

describe('a match is anonymous until they reveal', () => {
  it('carries the reveal state instead of dropping it', () => {
    /*
     * The server gates the payload — pre-reveal `name` is the pseudonym and
     * `image` is null — so the list cannot leak a name it was never sent. What
     * it can get wrong is *drawing* that state: a null photo through the
     * ordinary avatar is an empty grey circle, which reads as a broken row
     * rather than as anonymity working.
     */
    const src = SCREEN()
    expect(src).toContain('they_revealed: conv.theyRevealed !== false')
    expect(src).toContain('pseudonymous: !c.they_revealed')
  })

  it('defaults an absent flag to revealed, not to anonymous', () => {
    /*
     * Looks like the wrong direction and is not. `mayShowRealName` returns
     * true for a conversation that never had a pseudonym — an accepted message
     * request, which has shown real names since it existed. Defaulting to
     * `false` would stamp a generated disc over every one of them.
     *
     * Safe because this flag picks a picture, not a permission: the name and
     * the photo are gated server-side either way.
     */
    expect(SCREEN()).toContain('!== false')
    expect(SCREEN()).not.toContain('theyRevealed === true')
  })

  it('draws the generated mark, seeded on the pseudonym', () => {
    /*
     * The same mark the Scene's attendee discs and the room use, so one person
     * is one colour and one creature everywhere they appear under that name.
     *
     * Seeded on `item.title` — which *is* the pseudonym pre-reveal. Never a
     * user id: that is stable forever and would rebuild exactly the
     * cross-surface identity the pseudonyms exist to prevent.
     */
    const sections = SECTIONS()
    expect(sections).toContain('<PseudonymDisc pseudonym={item.title} />')
    expect(sections).toContain('pseudonymAvatar(pseudonym)')
    const disc = sections.slice(sections.indexOf('function PseudonymDisc'))
    expect(disc.slice(0, disc.indexOf('}\n'))).not.toContain('id')
  })

  it('names an unknown person the way the server does', () => {
    // The server's last resort is `UNNAMED = "Someone"`. "Unknown" reads as a
    // data error, which an unrevealed match is not.
    const src = SCREEN()
    expect(src).toContain("|| 'Someone'")
    expect(src).not.toContain("|| 'Unknown'")
  })
})

describe('requests look like the conversations they become', () => {
  it('is a row, not a radius-32 card', () => {
    const sections = SECTIONS()
    const req = sections.slice(sections.indexOf('request: {'))
    const body = req.slice(0, req.indexOf('},'))
    expect(body).not.toContain('EMBER_RADIUS.card')
    expect(body).not.toContain('backgroundColor')
    expect(body).toContain('paddingVertical: SPACE.md')
  })

  it("draws the sender's face and when they asked", () => {
    const src = SCREEN()
    expect(src).toContain('sender_avatar: r.sender?.avatar || null')
    expect(src).toContain('created_at: r.createdAt || null')
    expect(src).toContain('timeLabel={inboxTimeLabel(r.created_at)}')
  })

  it('gives Accept the accent — the only one on the screen with rows', () => {
    const sections = SECTIONS()
    expect(sections).toContain('requestAccept: { backgroundColor: EMBER.accent }')
    expect(sections).toContain('requestAcceptLabel: { ...TYPE.button, color: EMBER.onGradient }')
    expect(sections).toContain('requestDecline: { backgroundColor: EMBER.surface }')
    expect(sections).toContain('height: CONTROL.sm')
    // Nothing else in the sections reaches for it.
    expect(sections.match(/EMBER\.accent/g)).toHaveLength(1)
  })

  it('shows the count beside the heading', () => {
    expect(SCREEN()).toContain('<BanterHeading title="Requests" detail={String(incomingRequests.length)} />')
  })

  it('keeps the exit and reflow animations', () => {
    const src = SCREEN()
    expect(src).toContain('exiting={reduceMotion ? undefined : REQUEST_OUT}')
    expect(src).toContain('layout={reduceMotion ? undefined : REQUEST_REFLOW}')
  })
})

describe('what the API already sends is read', () => {
  it('reads room unread, sender and cover from the group payload', () => {
    const src = SCREEN()
    expect(src).toContain('room.unreadCount')
    expect(src).toContain('last_sender_name: room.lastMessage?.user?.name || undefined')
    expect(src).toContain('room.event?.coverImageUrl')
    expect(src).toContain('avatarUrl: c.event_image')
    expect(src).toContain('unread: c.unread_count > 0')
  })

  it('no longer carries a venue that was always "Unknown Venue"', () => {
    expect(SCREEN()).not.toContain('event_venue')
    expect(SCREEN()).not.toContain('Unknown Venue')
  })

  it('knows when the last DM was yours', () => {
    const src = SCREEN()
    expect(src).toContain('conv.lastMessage.senderId === user?.id')
    expect(src).toContain('previewWithSender(c.last_message, { fromMe: c.last_message_from_me })')
  })

  it('bumps a room it is not showing when someone else writes in it', () => {
    const src = SCREEN()
    expect(src).toContain('const bump = !isFromMe && openRoomRef.current !== data.chatGroupId')
    expect(src).toContain('unread_count: bump ? updated[idx].unread_count + 1 : updated[idx].unread_count')
  })

  it('offers Mark all read for DMs only — no endpoint marks a room read', () => {
    const src = SCREEN()
    expect(src).toContain('const hasUnread = useMemo(() => personalChats.some((c) => c.unread_count > 0), [personalChats])')
    expect(src).toContain("action={item.first && hasUnread ? 'Mark all read' : undefined}")
  })

  it('searches the room sender too', () => {
    expect(SCREEN()).toContain("${c.last_sender_name ?? ''}")
    expect(SCREEN()).toContain('r.searchText.includes(trimmedQuery)')
  })

  it('tells you someone asked to reveal, until you open the thread', () => {
    const src = SCREEN()
    expect(src).toContain('c.reveal_requested && !revealSeen.has(c.conversation_id)')
    expect(src).toContain("'Asked to reveal names'")
  })

  it('formats no date through the device locale', () => {
    expect(SCREEN()).not.toContain('toLocaleDateString')
  })
})

describe('the conversations are grouped by when', () => {
  it('buckets through DayHeading, and hides every heading when empty', () => {
    const src = SCREEN()
    expect(src).toContain('bucketRows(visibleRows)')
    expect(src).not.toContain('title="Recent"')
    expect(SECTIONS()).toContain('<DayHeading title={title} />')
  })

  it('only says the inbox is empty when nothing is above the list either', () => {
    expect(SCREEN()).toContain('hasHeaderContent ? null : (')
  })

  it('draws a skeleton with both avatar shapes', () => {
    const src = SCREEN()
    expect(src).toContain('<SkeletonBlock width={ROW_AVATAR} height={ROW_AVATAR} borderRadius={EMBER_RADIUS.sm} />')
    expect(src).toContain('<SkeletonCircle width={ROW_AVATAR} />')
  })
})

describe('inbox helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { inboxTimeLabel, activityBucket, bucketRows, previewWithSender, liveRoomMeta } = require('../components/banter/inbox')
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
    expect(inboxTimeLabel(at(2026, 8, 24), now)).toBe('Sep 24')
    expect(inboxTimeLabel(at(2025, 9, 4), now)).toBe('Oct 4, 2025')
    expect(inboxTimeLabel(undefined, now)).toBe('')
    expect(inboxTimeLabel('not a date', now)).toBe('')
  })

  it('buckets by calendar day', () => {
    expect(activityBucket(at(2026, 9, 1, 0, 5).getTime(), now)).toBe('Today')
    expect(activityBucket(at(2026, 8, 30, 23).getTime(), now)).toBe('This week')
    expect(activityBucket(at(2026, 8, 25).getTime(), now)).toBe('This week')
    expect(activityBucket(at(2026, 8, 24).getTime(), now)).toBe('Earlier')
    expect(activityBucket(0, now)).toBe('Earlier')
  })

  it('groups in order and drops empty buckets', () => {
    const rows = [
      { id: 'a', sortTime: at(2026, 9, 1, 14).getTime() },
      { id: 'b', sortTime: at(2026, 7, 1).getTime() },
      { id: 'c', sortTime: 0 },
    ]
    const buckets = bucketRows(rows, now)
    expect(buckets.map((b: { title: string }) => b.title)).toEqual(['Today', 'Earlier'])
    expect(buckets[1].rows.map((r: { id: string }) => r.id)).toEqual(['b', 'c'])
  })

  it('says who wrote the preview', () => {
    expect(previewWithSender('hi', { fromMe: true, name: 'Mika' })).toBe('You: hi')
    expect(previewWithSender('hi', { name: 'Velvet Otter' })).toBe('Velvet Otter: hi')
    expect(previewWithSender('hi', { name: '  ' })).toBe('hi')
    expect(previewWithSender('hi', {})).toBe('hi')
  })

  it('leaves an unknown room count off', () => {
    expect(liveRoomMeta(12)).toBe("You're here · 12 in the room")
    expect(liveRoomMeta(0)).toBe("You're here")
    expect(liveRoomMeta(undefined)).toBe("You're here")
  })
})
