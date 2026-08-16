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
    expect(src).toContain('pseudonymAvatar(senderId)')
    expect(src).not.toMatch(/OptimizedImage|<Image|profile_photos/)
  })

  it('seeds the avatar from the id, never the display name', () => {
    /*
     * Seeding from the name would give two people called "Guest" the same
     * creature, and would change somebody's mark the moment they revealed.
     */
    expect(codeOnly(BUBBLE())).not.toContain('pseudonymAvatar(senderName)')
  })

  it('counts reactions without naming who left them', () => {
    // Who reacted is exactly the kind of thing this room does not disclose.
    const src = codeOnly(BUBBLE())
    expect(src).toContain('senders.length')
    expect(src).not.toMatch(/senders\.(map|join)\(/)
  })
})

describe('a paid message cannot be mistaken for the room’s own voice', () => {
  const BROADCAST = () => read('components/chat/BroadcastNotice.tsx')

  it('labels sponsored messages in words', () => {
    // A paid message styled like an organiser's is an advert wearing the
    // venue's voice. The label is not decoration.
    expect(codeOnly(BROADCAST())).toContain("'SPONSORED'")
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
})

describe('your own profile draws the same pieces as everybody else’s', () => {
  /*
   * `ProfileSections.tsx` was written for both frames and only the attendee
   * half was ever wired -- the fifth time something here was built and never
   * called. `noOrphanComponents` could not see it: the file *had* an importer,
   * just not the second one it was written for.
   */
  const OWN = () => codeOnly(read('app/(tabs)/profile.tsx'))

  it('renders through components/profile, not its own hero', () => {
    const src = OWN()
    for (const name of ['ProfileHero', 'ProfileBio', 'ProfileInterests', 'ProfileDetail', 'ProfileOwnCta']) {
      expect(src).toContain(`<${name}`)
    }
  })

  it('has left APP_COLORS behind', () => {
    // It was the last screen in the app still on the old theme.
    expect(OWN()).not.toContain('APP_COLORS.')
  })

  it('clears the tab bar under the hero name', () => {
    /*
     * The name is anchored to the hero's bottom, which is right on the
     * full-screen attendee route and put "Kishore, 28" under the tab bar here.
     */
    expect(OWN()).toContain('bottomInset={TAB_BAR_CLEARANCE}')
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
