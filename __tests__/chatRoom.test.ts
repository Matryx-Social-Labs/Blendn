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
  const BUBBLE = () => read('components/chat/ChatBubble.tsx')

  it('squares the corner on the sender’s side, and only that one', () => {
    /*
     * Every corner is 24 except one, which is 4. That single square corner is
     * what tells the two directions apart -- backwards, it reads as *wrong*
     * rather than as *different*, because the message points at the wrong
     * person.
     */
    const src = codeOnly(BUBBLE())
    expect(src).toContain('bubbleTheirs: { backgroundColor: \'#1B1919\', borderBottomLeftRadius: 4 }')
    expect(src).toContain('borderBottomRightRadius: 4')
  })

  it('never draws a photograph', () => {
    /*
     * The frame draws faces. This room is pseudonymous until somebody chooses
     * otherwise, so a photo here undoes what `app/room.tsx` exists to protect.
     * `pseudonymAvatar` is the only avatar source allowed on this surface.
     */
    const src = codeOnly(BUBBLE())
    expect(src).toMatch(/pseudonymAvatar\(`\$\{roomId\}:\$\{senderId\}`\)/)
    expect(src).not.toMatch(/OptimizedImage|<Image|profile_photos/)
  })

  it('seeds the avatar from the room and the id, never from either alone', () => {
    /*
     * Both single-seed options are wrong, in opposite directions.
     *
     * The display name would give two people falling back to "Attendee" the
     * same creature, and would change somebody's mark the moment they revealed.
     *
     * The id alone is worse: `lib/pseudonymAvatar.ts` says "Never feed it a
     * user id: that is stable forever and would rebuild exactly the cross-event
     * identity the pseudonyms exist to prevent." It shipped that way, so every
     * message anybody sent carried the same colour and creature in every room
     * they had ever been in.
     *
     * Salting the id with the room is stable inside a room, unique per person
     * in it, different in the next one, and unaffected by a reveal.
     */
    const src = codeOnly(BUBBLE())
    expect(src).not.toContain('pseudonymAvatar(senderName)')
    expect(src).not.toContain('pseudonymAvatar(senderId)')
    expect(src).toMatch(/pseudonymAvatar\(`\$\{roomId\}:\$\{senderId\}`\)/)
  })

  it('counts reactions without naming who left them', () => {
    /*
     * Who reacted is exactly the kind of thing this room does not disclose.
     *
     * This used to assert `senders.length` — the component honouring the rule
     * by convention while the prop was `Record<emoji, senderIds[]>` and carried
     * the identities anyway. The server now sends a tally, so the names are not
     * in the payload for the next reader to find, and the assertion moves to
     * the shape rather than to one component's restraint.
     */
    const src = codeOnly(BUBBLE())
    expect(src).toContain('count > 1')
    expect(src).toMatch(/reactions\?: \{ emoji: string; count: number/)
    // Nothing that could hold a person: no id list, no name list, no map of who.
    expect(src).not.toMatch(/senders/)
    expect(src).not.toMatch(/Record<string, string\[\]>/)
  })
})

describe('a paid message cannot be mistaken for the room’s own voice', () => {
  const BROADCAST = () => read('components/chat/BroadcastNotice.tsx')

  it('labels sponsored messages in words', () => {
    // A paid message styled like an organiser's is an advert wearing the
    // venue's voice. The label is not decoration.
    expect(codeOnly(BROADCAST())).toContain("'SPONSORED'")
  })

  it('lifts the organisation out of the announcement’s label line', () => {
    /*
     * Driven on Android: an organiser's announcement rendered as the
     * ANNOUNCEMENT notice with "📢 [Announcement from Nightshift Collective]"
     * as its first line -- the label twice, the emoji once. The name is the
     * part worth keeping; it becomes "ANNOUNCEMENT · NIGHTSHIFT COLLECTIVE".
     */
    const src = codeOnly(read('components/chat/BroadcastNotice.tsx'))
    expect(src).toMatch(/\/\^📢 \\\[Announcement from \(\[\^\\\]\]\+\)\\\]\\n\//)
    expect(src).toContain('`ANNOUNCEMENT · ${from[1].toUpperCase()}`')
    expect(src).toContain('text.slice(from[0].length)')
  })

  it('keeps the room’s gradient off sponsored content', () => {
    /*
     * The warm rail is the room's own colour and marks an organiser speaking.
     * Sponsored gets a deliberately cooler treatment so it cannot borrow it --
     * so the gradient must be reachable only on the announcement branch.
     */
    const src = codeOnly(BROADCAST())
    /*
     * The branch itself, not the order the two names happen to appear in the
     * file -- `LinearGradient` shows up in the import first, which made an
     * index comparison pass for the wrong reason.
     */
    expect(src).toMatch(
      /sponsored \? \([\s\S]{0,200}railSponsored[\s\S]{0,200}\) : \([\s\S]{0,300}<LinearGradient/
    )
    // And the warm rail is reachable from nowhere else on this surface.
    expect(src.match(/<LinearGradient/g)).toHaveLength(1)
  })
})

describe('the composer offers only what the server accepts', () => {
  it('has no attach button', () => {
    /*
     * Attendees post no media -- only sponsored broadcasts may carry it. A
     * button that opens a picker whose result the server rejects is worse than
     * no button.
     */
    const src = codeOnly(read('components/chat/ChatComposer.tsx'))
    expect(src).not.toMatch(/ImagePicker|launchImageLibrary|DocumentPicker|attach/i)
  })
})

describe('the screen renders through the rebuilt components', () => {
  const SCREEN = () => codeOnly(read('app/chat/[id].tsx'))

  it('draws every message kind through components/chat', () => {
    const src = SCREEN()
    for (const name of ['ChatBubble', 'BroadcastNotice', 'SystemNotice', 'TypingIndicator', 'ChatComposer']) {
      expect(src).toContain(`<${name}`)
    }
  })

  it('still handles announcements and sponsored messages', () => {
    // Broadcasts arrive down the same socket as everything else and were the
    // easiest thing to drop in a render swap -- three features went that way
    // on the Scene.
    expect(SCREEN()).toContain("item.message_type === 'announcement'")
  })

  it("recognises a sponsored send on both paths, because its `type` is its media kind", () => {
    /*
     * Driven on iOS: the scheduler's send rendered as a bubble from "Attendee"
     * with a "📣 [Sponsored]" line, not as the SPONSORED notice. `type` on an
     * ad is `text` or `image`; the marker is `metadata.sponsored_message_id`
     * in history and `kind` on the wire. Either mapping missing reproduces it.
     */
    const src = SCREEN()
    expect(src).toContain("msg.metadata?.sponsored_message_id")
    expect(src).toContain("data.message.kind === 'sponsored'")
    // And the label line is not printed twice under the SPONSORED label.
    expect(codeOnly(read('components/chat/BroadcastNotice.tsx'))).toMatch(/text\.replace\(\/\^📣 \\\[Sponsored\\\]\\n\//)
  })

  it('lets VoiceOver pick Report on its own', () => {
    /*
     * Driven with Maestro on iOS: the long-press menu read as one node,
     * "↩️ Reply 📋 Copy 🚩 Report", because the scrim TouchableOpacity is
     * accessible by default and iOS collapses everything inside it. The
     * safety action was unreachable to a screen reader.
     */
    const src = SCREEN()
    expect(src).toMatch(/style=\{styles\.modalOverlay\}[^>]*accessible=\{false\}/)
    for (const label of ['Reply', 'Copy', 'Report']) {
      expect(src).toContain(`accessibilityRole="button" accessibilityLabel="${label}"`)
    }
  })

  it('keeps day separators and system messages in one shape', () => {
    /*
     * Both are the room narrating rather than a person speaking. Drawn
     * differently, a date reads as something somebody said.
     */
    const src = SCREEN()
    expect(src).toContain('<SystemNotice label={item.label} />')
    expect(src).toContain('<SystemNotice label={item.message_text} />')
  })

  it('puts typing in the feed rather than above the composer', () => {
    // Pinned, it was equally present whether you were reading the newest
    // message or two hundred back -- a note about right now, over history.
    expect(SCREEN()).toMatch(/ListFooterComponent=\{[\s\S]{0,400}TypingIndicator/)
  })

  it('sends the reply’s parent, and reads it back under the server’s name', () => {
    /*
     * Driven on two phones: a reply drew its quote on the sender's optimistic
     * bubble and nowhere else. `sendChatMessage` never carried `parentId`, the
     * history mapper read two field names the server has never sent
     * (`parent_id` and `parent_message` are what arrive), and a live reply was
     * appended without resolving its quote. Three halves of one feature.
     */
    const src = codeOnly(SCREEN())
    expect(src).toMatch(/sendChatMessage\([^)]*optimistic\.reply_to_message_id/)
    expect(src).toContain('reply_to_message_id: msg.parent_id ||')
    expect(src).toContain('msg.parent_message')
    expect(src).toMatch(/replyTo: newMsg\.reply_to_message_id \? prev\.find/)
    expect(codeOnly(read('lib/apiClient.ts'))).toContain('...(parentId && { parentId })')
  })

  it('keeps the end in view as the list finishes laying out', () => {
    /*
     * Opening the room landed above the newest messages: `scrollToEnd` ran
     * on a timer before the list had measured its later rows, so "Today"
     * sat on the bottom edge with the day's messages beneath it, unseen.
     */
    const src = codeOnly(SCREEN())
    expect(src).toMatch(/onContentSizeChange=\{\(\) => \{ if \(followEndRef\.current\) scrollToBottom\(false\) \}\}/)
    // Following stops on a real drag, not on the geometry of a programmatic
    // scroll: the first fix keyed off `isAtBottomRef`, and the content growing
    // once more after scrollToEnd read as "not at the bottom", so the room
    // still opened with the newest bubble under the composer.
    expect(src).toMatch(/onScrollBeginDrag=\{\(\) => \{ followEndRef\.current = false \}\}/)
    expect(src).toMatch(/if \(atBottom\) followEndRef\.current = true/)
  })

  it('drops the optimistic bubble when the socket echo beat the response', () => {
    /*
     * Seen on the phone as a LogBox "two children with the same key" and the
     * reply drawn twice: the server echoes the sender's own message to the
     * room, and on a slow send it arrived before the POST returned, so the
     * optimistic row was renamed to an id already in the list.
     */
    const src = codeOnly(SCREEN())
    expect(src).toMatch(/prev\.some\(m => m\.message_id === newId\)\s*\? prev\.filter\(m => m\.message_id !== optimistic!\.message_id\)/)
  })
})

describe('the room opens the chat in front of itself', () => {
  it('replaces the modal rather than pushing beneath it', () => {
    /*
     * `app/room.tsx` is `presentation: 'modal'`. On iOS a card pushed after a
     * modal lands on the stack under it: Join Chat fetched the room and
     * showed nothing, and closing the room then took two taps. Driven
     * 2026-09-13 on the simulator, from a fresh launch.
     */
    const src = codeOnly(read('app/room.tsx'))
    expect(src).toMatch(/router\.replace\(\{\s*pathname: '\/chat\/\[id\]'/)
    expect(src).not.toMatch(/router\.push\(\{\s*pathname: '\/chat\/\[id\]'/)
  })
})

describe('the Me tab is a control panel, not a second profile', () => {
  /*
   * It was briefly the editorial frame `1141:5633` -- which was a second copy
   * of a screen that already existed. `app/user/[id].tsx` has a `'self'` mode,
   * so pointing it at your own id renders that page with Connect suppressed.
   *
   * Preview being *the same screen* is the whole point: "how others see me"
   * cannot drift from how they actually see you, gating included.
   */
  const OWN = () => codeOnly(read('app/(tabs)/profile.tsx'))

  it('sends Preview to the attendee screen rather than re-rendering it', () => {
    const src = OWN()
    expect(src).toContain("pathname: '/user/[id]'")
    // The editorial pieces belong to that screen now, not this one.
    expect(src).not.toMatch(/<ProfileHero|<ProfileOwnCta|<ProfileBio/)
  })

  it('offers Edit profile and Settings', () => {
    const src = OWN()
    expect(src).toContain("router.push('/edit-profile')")
    expect(src).toContain("router.push('/settings')")
  })

  it('has left APP_COLORS behind', () => {
    // It was the last screen in the app still on the old theme.
    expect(OWN()).not.toContain('APP_COLORS.')
  })

  it('shows counts, and hides a role you do not have', () => {
    /*
     * `stats` is three numbers and no endpoint returns the events behind them,
     * so the frame's `CIRCLE PRESENCE` gallery stays unbuilt. `eventsOrganized`
     * is hidden at zero: a permanent "0 Hosted" reads as something you failed
     * to do rather than a role you do not have.
     */
    expect(OWN()).toContain('stats.eventsOrganized > 0')
  })

  it('does not invent a handle, a tier, or an event history', () => {
    /*
     * The frame draws `@blendn_julia`, a `PRO` badge and three attended-event
     * cards. Nothing backs any of them -- there is no username field, no
     * subscription, and no endpoint returning attended events. See
     * `docs/PROFILE.md`.
     */
    const src = OWN()
    expect(src).not.toMatch(/@blendn|handle|username/i)
    expect(src).not.toMatch(/\bPRO\b/)
    expect(src).not.toMatch(/CIRCLE PRESENCE/i)
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
    expect(src).toContain('<PhotoLightbox')
  })

  it('offsets the index past the hero photo', () => {
    // The gallery is `photos.slice(1)`, so without `+1` every tap opened the
    // photo before the one you touched.
    expect(codeOnly(read('app/user/[id].tsx'))).toContain('setLightboxIndex(i + 1)')
  })
})

describe('direct messages use the same bubble, minus what a DM does not need', () => {
  const DM = () => codeOnly(read('app/private-chat/[conversationId].tsx'))

  it('renders through components/chat', () => {
    const src = DM()
    expect(src).toContain('<ChatBubble')
    expect(src).toContain('<ChatComposer')
    expect(src).toContain('<SystemNotice')
  })

  it('drops the avatar and the name', () => {
    /*
     * A DM has exactly one other person in it. A disc and a name on every
     * inbound row repeat the screen's title once per message, and halve the
     * width of the column to do it.
     */
    expect(DM()).toContain('variant="direct"')
    const bubble = codeOnly(read('components/chat/ChatBubble.tsx'))
    expect(bubble).toContain('{mine || direct ? null : (')
  })

  it('shows a receipt only on your own messages', () => {
    expect(DM()).toContain("receipt={isMe ? (item.isRead ? 'read' : 'sent') : null}")
  })

  it('keeps receipts out of the room', () => {
    /*
     * Twenty people read at twenty different times, so a tick there would
     * either lie or need twenty answers. The room passes no `receipt` at all.
     */
    expect(codeOnly(read('app/chat/[id].tsx'))).not.toContain('receipt=')
  })

  it('does not offer to report your own message', () => {
    expect(DM()).toContain('onLongPress={isMe ? undefined :')
  })
})

describe('both chat screens have left the old theme', () => {
  it('uses EMBER throughout', () => {
    // The messages were rebuilt first and the chrome around them was still
    // `APP_COLORS` -- new bubbles in an old frame.
    for (const screen of ['app/chat/[id].tsx', 'app/private-chat/[conversationId].tsx']) {
      expect(read(screen)).not.toContain('APP_COLORS')
    }
  })
})
