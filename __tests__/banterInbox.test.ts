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

  it('does not truncate the name of a pinned conversation', () => {
    /*
     * Fixed at the avatar's width this rendered "Gala Nig…". A pinned row that
     * abbreviates the thing it is pinning is doing the opposite of its job.
     */
    expect(SECTIONS()).toContain('minWidth: PINNED_AVATAR')
    expect(SECTIONS()).not.toContain('width: PINNED_AVATAR + 8')
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
    expect(SCREEN()).toContain('ListEmptyComponent={loading ? <InboxSkeleton /> : <EmptyInbox />}')
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

  it('reuses the frame\'s rail rather than inventing a section', () => {
    // Same component, same 64pt discs, same 24 gap, same gutter bleed. Only
    // the heading changes, because only the meaning changed.
    const src = SCREEN()
    expect(src).toContain('<BanterPinned')
    expect(src).toContain('title="Live now"')
    expect(src).toContain('online: true')
  })
})

describe('the unread dot lands on the avatar', () => {
  it('builds the ring outwards, which is the only way RN can', () => {
    /*
     * Frame `1141:5296` rings the dot with `shadow: 0 0 0 2px #0F0E0E` —
     * outset. `borderWidth: 2` grows *inwards*, which leaves an 8pt accent core
     * in a 12pt footprint.
     *
     * The dot sits at the bounding box's top-right and the avatar is a circle,
     * so that corner is empty space: the dot's centre is √(22²+22²) = 31.1 from
     * the 56pt avatar's centre against a radius of 28. An 8pt core reaches back
     * to 27.1 and grazes the rim; the frame's 12pt core reaches 25.1 and bites
     * into the photograph. That difference is the whole reason it read as
     * floating beside the avatar rather than sitting on it.
     */
    const sections = SECTIONS()
    const ring = sections.slice(sections.indexOf('unreadRing: {'))
    const body = ring.slice(0, ring.indexOf('},'))
    expect(body).toContain('top: -2')
    expect(body).toContain('right: -2')
    expect(body).toContain('width: 16')
    expect(body).toContain('backgroundColor: EMBER.bg')

    const dot = sections.slice(sections.indexOf('unreadDot: {'))
    const dotBody = dot.slice(0, dot.indexOf('},'))
    expect(dotBody).toContain('width: 12')
    expect(dotBody).toContain('backgroundColor: EMBER.accent')
    // The inset border is the bug. It must not come back.
    expect(dotBody).not.toContain('borderWidth')
  })

  it('keeps the pinned presence dot inset, because that frame draws it inset', () => {
    /*
     * Not a copy-paste of the fix above. Frame `1141:5265` is a single 16pt
     * "Background+Border" rectangle — the ring is part of the 16, not outside
     * it — so `borderWidth: 2` is correct there and wrong three lines away.
     */
    const sections = SECTIONS()
    const presence = sections.slice(sections.indexOf('presence: {'))
    const body = presence.slice(0, presence.indexOf('},'))
    expect(body).toContain('width: 16')
    expect(body).toContain('borderWidth: 2')
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
