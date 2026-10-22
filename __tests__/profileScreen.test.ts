import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The attendee profile — frame `1141:5163`.
 *
 * The screen's whole job is to draw three server-decided states without
 * re-deciding any of them, so these pin the places where it could start.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SCREEN = () => stripComments(read('app/user/[id].tsx'))
const SECTIONS = () => stripComments(read('components/profile/ProfileSections.tsx'))
const STAGE = () => stripComments(read('components/profile/ProfileHeroStage.tsx'))

describe('the screen never re-decides the identity gate', () => {
  it("takes the server’s identityVisible, and fails closed without it", () => {
    /*
     * It used to infer "revealed" from a photo, a bio or an occupation having
     * arrived — so any identity field that turned up by mistake became a reveal
     * nobody agreed to. `GET /users/:id` now says `identityVisible` (the
     * server's `maySeeIdentity`, not re-derived here), and anything but `true`
     * drops the identity fields at the boundary (`withheldUnlessVisible`).
     */
    const src = SCREEN()
    expect(src).toContain('identityVisible: data.identityVisible === true || data.isOwnProfile === true')
    expect(src).toContain('withheldUnlessVisible(nextProfile)')
    expect(src).toContain('const revealed = identity.revealed')
    expect(src).not.toContain('const revealed = photos.length > 0')
    expect(src).not.toContain('maySeeIdentity')
    expect(src).not.toContain('theyRevealed')
  })

  it('draws a missing field as absent, never as an error', () => {
    /*
     * "No bio" and "not allowed to see the bio" are identical in the payload by
     * design. Rendering an error state for one would leak the distinction the
     * server withheld.
     */
    const src = SCREEN()
    expect(src).not.toContain('Not available')
    expect(src).not.toContain('Hidden')
    expect(src).not.toContain('Private')
    // Each section is conditional on its own field.
    expect(src).toContain('{profile?.bio ? (')
    // Each detail sits in its fold block (r7 M2), still behind its own field.
    expect(src).toMatch(/\{profile\?\.occupation \? \(\s*<FoldBlock id="occupation"[^>]*>\s*<ProfileDetail label="OCCUPATION"/)
    expect(src).toMatch(/\{profile\?\.education \? \(\s*<FoldBlock id="education"[^>]*>\s*<ProfileDetail label="EDUCATION"/)
  })

  it('says out loud that an unrevealed profile is working as intended', () => {
    // Otherwise it reads as half-loaded, and the absence IS the product.
    expect(SCREEN()).toContain('hasn’t revealed who they are yet')
  })
})

describe('an unrevealed profile draws only what it was given', () => {
  it('falls back to the creature when there is no photo', () => {
    /*
     * Which, in the real app, is always: `rankMatches` and
     * `profiles/[userId]` both send an empty `profile_photos` for anyone
     * unrevealed. The creature (the room's own mark, `<Avatar kind="creature">`)
     * is what the screen actually renders today.
     */
    const src = STAGE()
    expect(src).toContain('<Avatar kind="creature" pseudonym={seed}')
  })

  it('blurs the derivative, never the real photos', () => {
    /*
     * The security property in one line: the unrevealed hero is fed `blurPhoto`
     * and the revealed one is fed `photos`, and they are never both present.
     *
     * If this ever becomes `photos={photos}` with `blurred` on top, the real
     * URLs are on the device and the blur is decoration — the bug
     * `MatchScreen.tsx` still carries a comment about, where "the anonymity was
     * one tap deep".
     */
    const src = SCREEN()
    expect(src).toContain('const blurHero = !revealed && profile?.blurPhoto ? [profile.blurPhoto] : []')
    expect(src).toContain('photos={revealed ? photos : []}')
    expect(src).toContain('blurredUri={blurHero[0] ?? null}')
  })

  it('falls back to the creature when there is no derivative', () => {
    // Which is every profile until people re-upload: the column is null for
    // every existing row, and a missing blur must not become a real photograph.
    expect(SCREEN()).toContain('profile?.blurPhoto ? [profile.blurPhoto] : []')
  })

  it('shows one still when blurred, not the pager', () => {
    // Cycling blurred photographs is motion with no information in it: you
    // cannot tell the frames apart, so it reads as a rendering fault.
    const src = STAGE()
    const branch = src.slice(src.indexOf('{shown ? ('), src.indexOf('hero-creature'))
    expect(branch.slice(branch.indexOf(') : blurredUri'))).not.toContain('ProfileHeroPager')
  })

  it('seeds the mark on the pseudonym, never a user id', () => {
    const hero = STAGE()
    expect(hero).not.toContain('userId')
    expect(hero).not.toContain('user_id')
  })
})

describe('the hero pager advances by itself until the first swipe', () => {
  it('stops for good on the first manual swipe, and never runs under Reduce Motion', () => {
    /*
     * That rule matters: resuming after a pause moves the thing you are looking
     * at out from under you. The gesture is the signal, not the page landing.
     */
    const src = stripComments(read('components/profile/ProfileHeroPager.tsx'))
    expect(src).toContain('onScrollBeginDrag={() => setManual(true)}')
    expect(src).toContain('const auto = !manual && !reduceMotion && count > 1')
  })

  it('does not repeat the hero’s first photo in the gallery', () => {
    // The hero already cycles all of them; repeating the first would show the
    // same picture twice on one screen.
    expect(SCREEN()).toContain('photos={photos.slice(1)}')
  })
})

describe('the profile carries the Grid\'s two actions', () => {
  it('offers Like and Connect, with the same meanings', () => {
    /*
     * They are the same two things and arriving here should not change what
     * they mean: Like is private until mutual and stays pseudonymous; Connect
     * is a message request and reveals your name and photo.
     *
     * This also settles the collision that "Connect" had two meanings on
     * adjacent screens -- the Grid's like and the profile's request.
     */
    expect(SCREEN()).toContain('{eventId ? (')
    expect(SCREEN()).toContain('onPress={handleLike}')
  })

  it('hides Like when there is no event to like within', () => {
    /*
     * `event_likes` is keyed on an event. Opened from a notification, the
     * Banter or a deep link there is no context, and a Like there would be
     * broken rather than merely useless. Connect still works: the server gates
     * a request on `haveSharedAnEvent` and resolves it itself.
     */
    expect(SCREEN()).toMatch(/useLocalSearchParams<\{\s*id: string\s*eventId\?: string/)
    // The room passes the event with the id when it opens a profile.
    expect(stripComments(read('components/blendn/BlendnScreen.tsx'))).toMatch(
      /\.\.\.\(eventId \? \{ eventId[,\s}]/
    )
  })

  it('keeps the like prominent here too', () => {
    // The safe, reversible action is the easy one on every surface: the one
    // gradient primary, before Connect, which publishes your identity (and is lit, not the gradient).
    const src = SCREEN()
    expect(src.indexOf("kind={liked ? 'lit' : 'primary'}")).toBeGreaterThan(-1)
    expect(src.indexOf("kind={liked ? 'lit' : 'primary'}")).toBeLessThan(src.indexOf("kind={ctaLit ? 'lit' : 'secondary'}"))
  })

  it('rolls a failed like back, and never a failed request', () => {
    /*
     * A like that did not land can simply be sent again. A request cannot --
     * `@@unique([sender_id, recipient_id])` means the failure may be *because*
     * one exists, and re-offering would invite an attempt that can never
     * succeed.
     */
    const src = SCREEN()
    const like = src.slice(src.indexOf('const handleLike'), src.indexOf('const sendConnect'))
    expect(like).toContain('setLiked(false)')
    const connect = src.slice(src.indexOf('const sendConnect'), src.indexOf('const openSafety'))
    expect(connect).not.toContain('setCtaMode(\'connect\')')
  })

  it('names them the way the server does in the sheet', () => {
    // Same rule as the Grid: the disclosure uses the resolved display name, so
    // an unrevealed person is named by their pseudonym.
    expect(SCREEN()).toContain('displayName={heroTitle}')
  })
})

describe('what the frame draws and the product cannot back', () => {
  it('ships no @handle and no PRO badge', () => {
    /*
     * Frame `1141:5176` reads "PRO MEMBER • @blendn_julia". There is no username
     * column and no membership tier. The accent line carries `work_field` and
     * `location` instead — which is the whole reason `work_field` sits outside
     * the identity gate: an attribute, not an address.
     */
    const src = SCREEN()
    expect(src).not.toContain('PRO MEMBER')
    expect(src).not.toContain('@blendn')
    expect(src).toContain("[profile?.workField, profile?.location].filter(Boolean).join(' · ')")
  })

  it('ships no Appreciate button', () => {
    /*
     * Frame `1141:5246`. Nothing in the product appreciates a profile, and the
     * like that does exist is the match mechanic on the grid — a different
     * gesture with a different meaning. A button that does nothing, or that
     * silently means "like", is worse than the gap.
     */
    expect(SECTIONS()).not.toContain('Appreciate')
  })
})

describe('the shared interest is the point, not an accent', () => {
  it('highlights the interests you both picked', () => {
    /*
     * Driven by the server's already-intersected `sharedInterests`, it is the
     * most useful thing on the screen: the reason you might talk to them.
     */
    const src = SECTIONS()
    expect(src).toContain('const shared = new Set((sharedInterests ?? []).map((s) => s.toLowerCase()))')
    expect(src).toContain('shared.has(interest.toLowerCase())')
  })

  it('wraps rather than copying the frame’s fixed five', () => {
    const src = SECTIONS()
    const wrap = src.slice(src.indexOf('chips: {'))
    expect(wrap.slice(0, wrap.indexOf('},'))).toContain("flexWrap: 'wrap'")
  })
})

describe('measurements that came off the frame', () => {
  it('keeps the hero at 1.3 of the width, so the tray and the first section are above the fold', () => {
    expect(STAGE()).toContain('PROFILE_HERO_ASPECT = 1.3')
  })

  it('sets the bio as body text from the type scale', () => {
    expect(SECTIONS()).toContain("font('body', bold)")
  })

  it('keeps occupation and education asymmetric', () => {
    // A filled card and a ruled block. Matching them would make two adjacent
    // facts read as a table.
    const src = SECTIONS()
    expect(src).toContain('detailCard: {')
    expect(src).toContain('detailRuled: {')
    const ruled = src.slice(src.indexOf('detailRuled: {'))
    expect(ruled.slice(0, ruled.indexOf('},'))).toContain('borderLeftWidth')
  })
})

describe('the hero ends on the page', () => {
  it('its foot scrim reaches full ink, so there is no seam above the page', () => {
    expect(STAGE()).toMatch(/<PhotoScrim contrast=\{contrast\} foot=\{1\}/)
  })
})
