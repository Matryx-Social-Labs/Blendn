import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The room's rebuild, pinned where a screenshot cannot reach.
 *
 * Frame `1141:5498` was drawn for a **named, public, media-rich community
 * chat**. What exists is an **anonymous, text-only room**. Every rule below is
 * that difference — and every one of them is invisible in a screenshot of a
 * seed room, because a seed room has no sponsored message, nobody who has
 * revealed themselves, and no photograph to leak. See `docs/CHAT.md`.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * Prose says anything you like. Two of these rules are about what the code
 * does *not* contain, and a doc comment explaining why it must not contain it
 * would satisfy a naive `not.toContain` on its own.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

describe('the bubble points at its sender', () => {
  /*
   * The room is pseudonymous: a sender is their creature, seeded on the
   * pseudonym, and a photo only where the room names them (the server sends
   * `image: null` in an event room). Since Flow 5 the bubble is the DS
   * ChatBubble, and the rows hand it the one seed rule.
   */
  const ROW = () => codeOnly(read('components/chat/RoomFeed.tsx'))

  it('seeds the creature on the pseudonym, the rule every surface shares — never on the id alone', () => {
    const src = ROW()
    expect(src).toContain('pseudonym: markSeed(m.sender_name, `${roomId}:${m.sender_id}`)')
    expect(src).not.toMatch(/pseudonym: m\.sender_id/)
  })

  /*
   * ROOM-07 (SV-6): the rule is "a photo only where the room names them". An event's room sends `image: null`, so it stays
   * a creature; a crew's room names its members and sends the photo. The row has ONE photo source, the message's
   * `sender_image` (what the server sent), and never reaches for a profile.
   */
  it('hands the room bubble only the photo the server sent for that message', () => {
    const src = ROW()
    expect(src).not.toMatch(/profile_photos|photo=\{/)
    expect(src).toContain('photoUri: m.sender_image')
    expect(src.match(/photoUri/g)).toHaveLength(1)
  })

  it('counts reactions without naming who left them', () => {
    // The tally carries counts and yours; nothing that could hold a person.
    const src = ROW()
    expect(src).toContain('(r ?? []).map((x) => ({ emoji: x.emoji, count: x.count, mine: !!x.mine }))')
    expect(codeOnly(read('components/ds/ChatBubble.tsx'))).not.toMatch(/senders|Record<string, string\[\]>/)
  })
})

describe('a paid message cannot be mistaken for the room’s own voice', () => {
  it('draws a broadcast full width through the DS notice, labelled', () => {
    const src = codeOnly(read('components/chat/RoomFeed.tsx'))
    expect(src).toMatch(/item\.message_type === 'announcement' \|\| item\.message_type === 'sponsored'[\s\S]{0,400}<BroadcastNotice kind=\{item\.message_type\}/)
    expect(codeOnly(read('components/ds/BroadcastNotice.tsx'))).toContain("`${announcement ? 'Announcement' : 'Sponsored'} · ${from}`.toUpperCase()")
  })

  it('lifts the organizer out of the announcement’s prefix, and never prints the sponsored one', () => {
    const src = codeOnly(read('lib/chatFeed.ts'))
    expect(src).toContain('const BROADCAST_HEAD = ')
    expect(src).toContain("kind === 'sponsored' ? 'Partner' : fallbackFrom")
  })
})

describe('the composer offers only what the server accepts', () => {
  it('offers a photo in a DM that can take one, and never in a room', () => {
    /*
     * Attendees post no media in a room (R9; the server refuses it, admin
     * #697). A DM takes a photo once both are named to each other.
     */
    expect(codeOnly(read('app/chat/[id].tsx'))).not.toMatch(/onAttach|ImagePicker|pickImage/)
    const dm = codeOnly(read('app/private-chat/[conversationId].tsx'))
    expect(dm).toContain('const photosAllowed = !!reveal && (!reveal.pseudonymous || (reveal.youRevealed && reveal.theyRevealed))')
    expect(dm).toContain('onAttach={photosAllowed ? () => void attach() : undefined}')
  })
})

describe('the screen renders through the redesign', () => {
  const SCREEN = () => codeOnly(read('app/chat/[id].tsx'))
  const ROW = () => codeOnly(read('components/chat/RoomFeed.tsx'))

  it('draws every message kind through the DS chat components', () => {
    const src = SCREEN() + ROW()
    for (const name of ['ChatBubble', 'BroadcastNotice', 'SystemLine', 'TypingIndicator', 'Composer', 'DayPill', 'LongPressMenu']) {
      expect(src).toContain(`<${name}`)
    }
  })

  it('recognises a sponsored send on both paths, because its `type` is its media kind', () => {
    const src = codeOnly(read('lib/roomMessages.ts'))
    expect(src).toContain('msg.metadata?.sponsored_message_id')
    expect(src).toContain("message.kind === 'sponsored'")
  })

  it('keeps day separators and system messages in the room’s own voice', () => {
    expect(SCREEN()).toContain('<DayPill text={item.label} />')
    expect(ROW()).toContain('<SystemLine text={item.message_text} />')
  })

  it('puts typing in the feed rather than above the composer', () => {
    expect(SCREEN()).toMatch(/ListFooterComponent=\{[\s\S]{0,300}<TypingIndicator/)
  })

  it('sends the reply’s parent, and reads it back under the server’s name', () => {
    const src = SCREEN()
    expect(src).toMatch(/sendChatMessage\([^)]*optimistic\.reply_to_message_id/)
    expect(codeOnly(read('lib/roomMessages.ts'))).toContain('reply_to_message_id: msg.parent_id ||')
    expect(codeOnly(read('lib/roomMessages.ts'))).toContain('msg.parent_message')
    expect(src).toMatch(/replyTo: incoming\.reply_to_message_id \? prev\.find/)
    expect(codeOnly(read('lib/apiClient.ts'))).toContain('...(parentId && { parentId })')
  })

  it('keeps the end in view as the list finishes laying out', () => {
    const src = SCREEN()
    expect(src).toMatch(/onContentSizeChange=\{follow\.onContentSizeChange\}/)
    expect(src).toMatch(/onScrollBeginDrag=\{follow\.onScrollBeginDrag\}/)
    expect(src).toMatch(/follow\.noteAtEnd\(atBottom\)/)
  })

  it('drops the optimistic bubble when the socket echo beat the response', () => {
    expect(SCREEN()).toMatch(/prev\.some\(\(m\) => m\.message_id === newId\)\s*\? prev\.filter\(\(m\) => m\.message_id !== optimistic\.message_id\)/)
  })

  it('offers each kind of message its own menu (R3-D5 5.2), Report on theirs only', () => {
    const src = SCREEN()
    expect(src).toContain("surface: 'room',")
    expect(src).toContain("report: { icon: 'flag', label: 'Report…'")
    // The table itself is pinned in messageMenu.test.ts.
  })
})

describe('the room opens the chat in front of itself', () => {
  it('pushes over the overlay, and the overlay is not a modal route', () => {
    /*
     * The room used to be `app/room.tsx`, `presentation: 'modal'`. On iOS a
     * card pushed after a modal lands on the stack under it: Join Chat fetched
     * the room and showed nothing, and closing the room then took two taps.
     * Driven 2026-09-13 on the simulator, from a fresh launch. The fix then was
     * `router.replace`, which closed the room to open its own chat.
     *
     * The room is the Blend'n overlay now, hosted by the tab layout *under*
     * the root stack (`lib/blendnOverlay.ts`), so a push lands on top of it
     * and Back returns to it. A push is only right while that holds — so this
     * pins both halves: the push, and that `/room` is no longer a screen.
     */
    const src = codeOnly(read('components/blendn/BlendnScreen.tsx'))
    expect(src).toMatch(/router\.push\(\{\s*pathname: '\/chat\/\[id\]'/)
    expect(src).not.toMatch(/router\.replace\(\{\s*pathname: '\/chat\/\[id\]'/)
    const route = codeOnly(read('app/room.tsx'))
    expect(route).toContain('openBlendn()')
    expect(route).not.toContain('BlendnScreen')
  })
})

describe('the Me tab is your profile, with no separate preview', () => {
  /*
   * It was a control panel whose Preview button opened `app/user/[id].tsx` in
   * its `'self'` mode. Two screens for one person was one too many: the
   * parts only Preview had (bio, interests) now render here, through the
   * same `ProfileSections` pieces that screen uses.
   */
  const OWN = () => codeOnly(read('app/(tabs)/profile.tsx'))

  it('shows what others see on this page instead of sending you to a preview', () => {
    const src = OWN()
    expect(src).not.toContain("pathname: '/user/[id]'")
    expect(src).not.toMatch(/>Preview</)
    expect(src).toContain('<ProfileBio')
    expect(src).toContain('<ProfileInterests')
    expect(src).toContain('<PhotoViewer')
  })

  it('offers Edit profile and Settings, Settings in the bar as a circle (Flow 6 me)', () => {
    const src = OWN()
    expect(src).toContain("router.push('/edit-profile')")
    expect(src).toContain("router.push('/settings')")
    expect(src).toContain("router.push('/friends/add')")
    expect(src).toContain("label: 'Settings'")
  })

  it('puts the header flat on the page: one display line, and Edit profile as the DS lit button', () => {
    const me = codeOnly(read('components/profile/MeSections.tsx'))
    expect(me.match(/font\('display'/g)).toHaveLength(2)
    expect(me).toContain('<Button kind="lit" size="md" icon="pencil" label="Edit profile"')
    expect(OWN()).not.toContain('surfaceMedia')
  })

  it('has left APP_COLORS and lib/theme behind', () => {
    expect(OWN()).not.toContain('APP_COLORS.')
    expect(OWN()).not.toContain("lib/theme'")
  })

  it('lists what is missing as rows, never a meter, with Add a photo the one gradient primary', () => {
    const src = OWN()
    expect(src).toContain('profileGaps(')
    expect(src).not.toMatch(/percent|\bprogress\b|completeness/i)
    expect(src).toContain('<Button kind="primary" icon="camera" label="Add a photo"')
    expect(src).not.toContain('EMBER.accent')
  })

  it('shows counts in one container, opens Going from them, and hides a role you do not have', () => {
    /*
     * `eventsOrganized` is hidden at zero: a permanent "0 Hosted" reads as
     * something you failed to do rather than a role you do not have.
     */
    const src = OWN()
    const me = codeOnly(read('components/profile/MeSections.tsx'))
    expect(me).toContain('hosted > 0')
    expect(me).toContain('label="Nights" onPress={onGoing}')
    expect(me).toContain('label="Saved" onPress={onGoing}')
    expect(src).toContain("router.navigate('/going')")
  })

  it('lists nights from the same attendance route and helper as Going', () => {
    /*
     * `/me/attendance` through `pastEventRows`, so the Me tab and Going's Past
     * section cannot disagree about what counts as past. Its own request, not
     * awaited by the profile load, and a failure puts a notice on Nights out.
     */
    const src = OWN()
    expect(src).toContain('apiClient.getMyAttendance(ATTENDANCE_LIMIT)')
    expect(src).toContain('pastEventRows(result.data.events)')
    expect(codeOnly(read('components/profile/NightsOut.tsx'))).toContain('<MemoryTile')
    expect(src).not.toContain('onToggleFavorite')
    expect(src).toContain("pathname: '/event/[id]'")
    expect(src).not.toMatch(/await loadRecent|Promise\.all/)
  })

  it('does not invent a handle, a tier, or read fields the server never sends', () => {
    /*
     * The frame draws `@blendn_julia` and a `PRO` badge. Nothing backs either
     * -- there is no username field and no subscription. `goals` and
     * `looking_for` were mapped from a response that never carries them.
     */
    const src = OWN()
    expect(src).not.toMatch(/@blendn|\bhandle\b|username/i)
    expect(src).not.toMatch(/\bPRO\b/)
    expect(src).not.toMatch(/CIRCLE PRESENCE/i)
    expect(src).not.toMatch(/goals|looking_for/)
  })
})

describe('a photo you can tap actually opens', () => {
  it('gives the attendee gallery a lightbox', () => {
    /*
     * `ProfileGallery` has always wrapped each tile in a `Pressable`, and
     * `app/user/[id].tsx` never passed `onPressPhoto` -- so every tap on
     * somebody's photos did nothing at all. A tap target that looks live and
     * is not is worse than a plain image.
     */
    const src = codeOnly(read('app/user/[id].tsx'))
    expect(src).toContain('onPressPhoto=')
    expect(src).toContain('<PhotoViewer')
  })

  it('offsets the index past the hero photo', () => {
    // The gallery is `photos.slice(1)`, so without `+1` every tap opened the
    // photo before the one you touched. The body is shared (`ProfileBody`, D26), so the offset lives there.
    expect(codeOnly(read('components/profile/ProfileSections.tsx'))).toContain('onPressPhoto(i + 1, from)')
  })
})

describe('direct messages use the same bubble, minus what a DM does not need', () => {
  const DM = () => codeOnly(read('app/private-chat/[conversationId].tsx'))
  const PARTS = () => codeOnly(read('components/chat/DmParts.tsx'))

  it('renders through the DS chat components', () => {
    const src = DM() + PARTS()
    for (const name of ['ChatBubble', 'Composer', 'DayPill', 'RevealBar', 'LongPressMenu']) expect(src).toContain(`<${name}`)
  })

  it('drops the avatar and the name', () => {
    // A DM has one other person in it; the DS bubble draws no name or creature for `surface="dm"`.
    expect(PARTS()).toContain("surface: 'dm' as const")
    expect(codeOnly(read('components/ds/ChatBubble.tsx'))).toContain("const room = surface === 'room' && !mine")
  })

  it('shows a receipt only under your own last message', () => {
    const src = DM()
    expect(src).toContain('receipt={mine && item.id === lastMineId ? receiptFor(item, myId) : null}')
    // Never a message that was not sent: one still on this phone, or one moderation withheld (rc8 #2).
    expect(src).toContain('!isLocalMessage(m) && !m.removed)?.id')
  })

  it('keeps receipts out of the room', () => {
    expect(codeOnly(read('app/chat/[id].tsx')) + codeOnly(read('components/chat/RoomFeed.tsx'))).not.toContain('receipt=')
  })

  it('does not offer to report your own message, but lets you copy it', () => {
    const src = DM()
    expect(src).toContain("surface: 'dm',")
    expect(src).toContain("copy: { icon: 'copy', label: 'Copy'")
  })
})

describe('the send button does not pretend the message is still in flight', () => {
  const COMPOSER = () => codeOnly(read('components/ds/Composer.tsx'))
  const ROOM = () => codeOnly(read('app/chat/[id].tsx'))
  const DM = () => codeOnly(read('app/private-chat/[conversationId].tsx'))
  const LOCK = () => codeOnly(read('lib/useComposerLock.ts'))

  it('has no spinner, and no prop that would drive one', () => {
    const src = COMPOSER()
    expect(src).not.toContain('ActivityIndicator')
    expect(src).not.toMatch(/\bsending\b/)
    expect(ROOM()).not.toMatch(/sending=\{/)
    expect(DM()).not.toMatch(/sending=\{/)
  })

  it('locks only for a reason it can name, in the server’s words', () => {
    const src = COMPOSER()
    for (const state of ['muted', 'automuted', 'locked', 'closed', 'ratelimited', 'notcheckedin', 'notopen', 'hidden']) {
      expect(src).toMatch(new RegExp(`${state}: \\{\\s*icon: '`))
    }
    expect(src).toContain('const body = reason ?? fallback')
  })

  it('still refuses a double tap, without rendering anything for it', () => {
    const src = ROOM()
    expect(src).toContain('sendInFlightRef.current) return')
    expect(src).toContain('sendInFlightRef.current = true')
    expect(src).toMatch(/else await deliver\(optimistic\)\s*sendInFlightRef\.current = false/)
  })

  it('turns the server’s refusal into a lock, alongside the kept failed bubble', () => {
    const lock = LOCK()
    for (const [code, state] of [['USER_MUTED', 'muted'], ['CHAT_LOCKED', 'locked'], ['NOT_CHECKED_IN', 'notcheckedin'], ['RATE_LIMITED', 'ratelimited']]) {
      expect(lock).toMatch(new RegExp(`case '${code}':[\\s\\S]*?state: '${state}'`))
    }
    // A rate limit lifts on its own; the server says when, and the clock counts it down.
    expect(lock).toContain('retryAfter ?? DEFAULT_WAIT_S')
    // Every answer re-decides it: a send that got through lifts it.
    expect(ROOM()).toContain('composer.apply(result.success ? null : result.errorCode, result.retryAfter, result.error, result.success ? null : result.reasonCode)')
    expect(ROOM()).toContain('countdown={composer.countdown}')
  })

  it('locks a DM for the server’s cooldown when it rate-limits or spam-blocks', () => {
    expect(LOCK()).toMatch(/case 'RATE_LIMITED':\s*case 'SPAM_BLOCKED':\s*return \{ state: 'ratelimited' \}/)
    expect(DM()).toContain('composer.apply(result.errorCode, result.retryAfter, result.error)')
  })

  it('carries retryAfter through the client so the cooldown is not guessed', () => {
    const src = codeOnly(read('lib/apiClient.ts'))
    expect(src).toMatch(/retryAfter\?: number/)
    expect(src).toMatch(/retryAfter: typeof parsed\.retryAfter === 'number'/)
    expect(src).toContain("response.headers.get('Retry-After')")
  })
})
