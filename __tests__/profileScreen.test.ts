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

describe('the screen never re-decides the identity gate', () => {
  it('reads no reveal flag, because the payload has none', () => {
    /*
     * `profiles/[userId]` withholds bio, occupation, education and photos behind
     * `maySeeIdentity` and returns the literal name "Attendee" otherwise. There
     * is no `revealed` boolean, and adding one would be a second source of truth
     * for a rule that already has exactly one.
     */
    const src = SCREEN()
    expect(src).toContain('const revealed = photos.length > 0')
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
    expect(src).toContain('{profile?.occupation || profile?.education ? (')
  })

  it('says out loud that an unrevealed profile is working as intended', () => {
    // Otherwise it reads as half-loaded, and the absence IS the product.
    expect(SCREEN()).toContain('Still anonymous')
  })
})

describe('an unrevealed profile draws only what it was given', () => {
  it('falls back to the generated mark when there is no photo', () => {
    /*
     * Which, in the real app, is always: `rankMatches` and
     * `profiles/[userId]` both send an empty `profile_photos` for anyone
     * unrevealed. The mark is what the screen actually renders today.
     */
    const src = SECTIONS()
    expect(src).toContain('pseudonymAvatar(pseudonym)')
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
    expect(src).toContain('photos={revealed ? photos : blurHero}')
    expect(src).toContain('blurred={!revealed}')
  })

  it('falls back to the mark when there is no derivative', () => {
    // Which is every profile until people re-upload: the column is null for
    // every existing row, and a missing blur must not become a real photograph.
    expect(SCREEN()).toContain('profile?.blurPhoto ? [profile.blurPhoto] : []')
  })

  it('shows one still when blurred, not the pager', () => {
    // Cycling blurred photographs is motion with no information in it: you
    // cannot tell the frames apart, so it reads as a rendering fault.
    const src = SECTIONS()
    const branch = src.slice(src.indexOf('{blurred && photos.length > 0 ? ('))
    expect(branch.slice(0, branch.indexOf(') : playlist'))).not.toContain('SceneHeroMedia')
  })

  it('seeds the mark on the pseudonym, never a user id', () => {
    const src = SECTIONS()
    const hero = src.slice(src.indexOf('export function ProfileHero'), src.indexOf('export function ProfileHeading'))
    expect(hero).not.toContain('userId')
    expect(hero).not.toContain('user_id')
  })
})

describe('the hero reuses the Scene’s pager rather than a second one', () => {
  it('is SceneHeroMedia, so auto-advance stops on the first manual swipe', () => {
    /*
     * That rule matters and is already written down there: resuming after a
     * pause moves the thing you are looking at out from under you. A second
     * pager would have to re-derive it, and would eventually disagree.
     */
    expect(SECTIONS()).toContain('<SceneHeroMedia')
  })

  it('does not repeat the hero’s first photo in the gallery', () => {
    // The hero already cycles all of them; repeating the first would show the
    // same picture twice on one screen.
    expect(SCREEN()).toContain('photos={photos.slice(1)}')
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
    expect(src).toContain("[profile?.workField, profile?.location].filter(Boolean).join(' • ')")
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
     * The frame's one gradient chip is decoration on the artboard. Driven by the
     * server's already-intersected `sharedInterests`, it becomes the most useful
     * thing on the screen: the reason you might talk to them.
     */
    const src = SECTIONS()
    expect(src).toContain('const shared = new Set((sharedInterests ?? []).map((s) => s.toLowerCase()))')
    expect(src).toContain('shared.has(interest.toLowerCase())')
  })

  it('wraps rather than copying the frame’s absolute positions', () => {
    /*
     * The frame places five chips into a fixed 168pt box. That arrangement only
     * holds for those five strings; real interests are any number of any length.
     */
    const src = SECTIONS()
    const wrap = src.slice(src.indexOf('chipWrap: {'))
    expect(wrap.slice(0, wrap.indexOf('},'))).toContain("flexWrap: 'wrap'")
  })
})

describe('measurements that came off the frame', () => {
  it('keeps the hero aspect, the gutter and the section rhythm', () => {
    const src = SECTIONS()
    expect(src).toContain('PROFILE_HERO_ASPECT = 751 / 390')
    expect(src).toContain('PROFILE_GUTTER = 12')
    expect(src).toContain('PROFILE_SECTION_GAP = 64')
  })

  it('gives the bio 26pt leading, which nothing else on the screen gets', () => {
    // The frame's own choice: it is the only long-form text here.
    const src = SECTIONS()
    const bio = src.slice(src.indexOf('bio: {'))
    expect(bio.slice(0, bio.indexOf('},'))).toContain('lineHeight: 26')
  })

  it('keeps occupation and education asymmetric', () => {
    // A filled card and a ruled block. Matching them would make two adjacent
    // facts read as a table.
    const src = SECTIONS()
    expect(src).toContain('detailCard: {')
    expect(src).toContain('detailRuled: {')
    const ruled = src.slice(src.indexOf('detailRuled: {'))
    expect(ruled.slice(0, ruled.indexOf('},'))).toContain('borderLeftWidth: 1')
  })
})
