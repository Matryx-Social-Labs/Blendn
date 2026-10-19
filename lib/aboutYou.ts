/**
 * Matching v2's "about you" (blendn-admin plan v2 §8): languages, home state,
 * an opt-in sign, this-or-that answers — and what cards say about them.
 *
 * **Display only.** None of these ranks anybody: the server prints a line when
 * two people share one ("Both from Kerala") and never scores it. So the editor
 * asks for them as fun, optional facts, never as filters, and the app never
 * sorts or hides people by them.
 *
 * **Never built:** caste, community, religion, kundli, veg / non-veg.
 * `__tests__/neverBuildFields.test.ts` fails the build if one appears here.
 *
 * The vocabulary is the server's (`GET /profile-options`); this file holds no
 * copy of it, only the shapes and the pure rules the editor needs.
 */

export interface Option {
  slug: string
  label: string
}

export interface SignOption {
  slug: string
  western: string
  rashi: string
  symbol: string
}

export interface ThisOrThatQuestion {
  slug: string
  a: string
  b: string
}

export interface ProfileOptions {
  languages: Option[]
  maxLanguages: number
  homeStates: Option[]
  signs: SignOption[]
  thisOrThat: ThisOrThatQuestion[]
}

export type SignSystem = 'western' | 'rashi'
export type Choice = 'a' | 'b'

/** A display line both of you share, as the server wrote it. */
export interface Overlap {
  kind: 'interest' | 'ipl' | 'this_or_that' | 'language' | 'home_state' | 'sign'
  text: string
}

/** Earned by check-ins, never typed. */
export interface Badge {
  kind: 'regular_here' | 'shows_up' | 'nights_out' | 'nights_together'
  label: string
}

/** The editable state, as the profile stores it. */
export interface AboutYou {
  languages: string[]
  homeState: string | null
  /** null: no sign shown. Off by default. */
  sign: { slug: string; system: SignSystem } | null
  showsUpBadge: boolean
  /** "Show my badges" — on unless turned off. */
  showBadges: boolean
}

export const NO_ABOUT_YOU: AboutYou = { languages: [], homeState: null, sign: null, showsUpBadge: false, showBadges: true }

/** Read from the caller's own profile payload, defensively: an older server sends none of it. */
export function aboutYouFrom(profile: Record<string, unknown> | null | undefined): AboutYou {
  const p = profile ?? {}
  const sign = typeof p.sun_sign === 'string' && (p.sign_system === 'western' || p.sign_system === 'rashi')
    ? { slug: p.sun_sign, system: p.sign_system as SignSystem }
    : null
  return {
    languages: Array.isArray(p.languages) ? (p.languages as unknown[]).filter((l): l is string => typeof l === 'string') : [],
    homeState: typeof p.home_state === 'string' ? p.home_state : null,
    sign,
    showsUpBadge: p.shows_up_badge === true,
    showBadges: p.show_badges !== false,
  }
}

/**
 * Only what the server still offers (step 10 review L4). A slug it retired
 * would otherwise ride along in the next save and be refused with the rest of
 * the form; dropping it on load means the save carries only live choices.
 */
export function withinOptions(about: AboutYou, options: ProfileOptions): AboutYou {
  const languages = new Set(options.languages.map((l) => l.slug))
  const states = new Set(options.homeStates.map((s) => s.slug))
  const signs = new Set(options.signs.map((s) => s.slug))
  return {
    ...about,
    languages: about.languages.filter((l) => languages.has(l)).slice(0, options.maxLanguages),
    homeState: about.homeState && states.has(about.homeState) ? about.homeState : null,
    sign: about.sign && signs.has(about.sign.slug) ? about.sign : null,
  }
}

/** Answers to questions the server still asks, the rest dropped (L4). */
export function answersWithin(answers: Readonly<Record<string, Choice>>, options: ProfileOptions): Record<string, Choice> {
  const asked = new Set(options.thisOrThat.map((q) => q.slug))
  return Object.fromEntries(Object.entries(answers).filter(([q, c]) => asked.has(q) && (c === 'a' || c === 'b')))
}

/** Add or remove one language, never past the cap. */
export function toggleLanguage(current: readonly string[], slug: string, max: number): string[] {
  if (current.includes(slug)) return current.filter((l) => l !== slug)
  return current.length >= max ? [...current] : [...current, slug]
}

/**
 * What `PUT /profiles/:id` needs to move `from` to `to`, and nothing else —
 * an unchanged field is not sent, so opening the screen and saving writes
 * nothing. A sign travels with its calendar, both set or both null.
 */
export function aboutYouUpdate(from: AboutYou, to: AboutYou): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (JSON.stringify(from.languages) !== JSON.stringify(to.languages)) body.languages = to.languages
  if (from.homeState !== to.homeState) body.home_state = to.homeState
  if (from.sign?.slug !== to.sign?.slug || from.sign?.system !== to.sign?.system) {
    body.sun_sign = to.sign?.slug ?? null
    body.sign_system = to.sign?.system ?? null
  }
  if (from.showsUpBadge !== to.showsUpBadge) body.shows_up_badge = to.showsUpBadge
  if (from.showBadges !== to.showBadges) body.show_badges = to.showBadges
  return body
}

/** Only the answers that changed: a choice, or `null` to take one back. */
export function answersUpdate(
  from: Readonly<Record<string, Choice>>,
  to: Readonly<Record<string, Choice>>
): Record<string, Choice | null> {
  const out: Record<string, Choice | null> = {}
  for (const q of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[q] !== to[q]) out[q] = to[q] ?? null
  }
  return out
}

/** "Leo ♌" or "Simha ♌". */
export function signName(sign: SignOption, system: SignSystem): string {
  return `${system === 'rashi' ? sign.rashi : sign.western} ${sign.symbol}`
}

/**
 * The line on somebody's profile once you can see who they are:
 * "Speaks Malayalam, Kannada · From Kerala · Leo ♌". Null when they said none.
 */
export function aboutLine(p: { languages?: string[] | null; homeState?: string | null; sign?: string | null }): string | null {
  const parts = [
    p.languages?.length ? `Speaks ${p.languages.join(', ')}` : null,
    p.homeState ? (p.homeState === 'Grew up abroad' ? p.homeState : `From ${p.homeState}`) : null,
    p.sign || null,
  ].filter((x): x is string => !!x)
  return parts.length ? parts.join(' · ') : null
}

/** The profile fields the server rate-limits together: three changes a day (blendn-admin `lib/tier-b.ts`). */
const TIER_B_KEYS = ['languages', 'home_state', 'sun_sign', 'sign_system'] as const

/**
 * A profile body in two: the Tier B facts, and the rest (the badge switches).
 * They go in separate PUTs because the server refuses a whole request when its
 * Tier B part is over the day's limit, and writes nothing else in it — so a
 * badge switch sent beside a refused language change was lost with it.
 */
export function splitTierB(body: Record<string, unknown>): { tierB: Record<string, unknown>; other: Record<string, unknown> } {
  const tierB: Record<string, unknown> = {}
  const other: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) (TIER_B_KEYS as readonly string[]).includes(key) ? (tierB[key] = value) : (other[key] = value)
  return { tierB, other }
}

/** "languages, home state and sign": which of the person's Tier B edits a body carries, in their words. */
export function tierBNames(body: Record<string, unknown>): string {
  const names = [
    'languages' in body ? 'languages' : null,
    'home_state' in body ? 'home state' : null,
    'sun_sign' in body || 'sign_system' in body ? 'sign' : null,
  ].filter((n): n is string => n !== null)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
}
