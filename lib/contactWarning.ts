/**
 * A warning before contact details are sent (Flow 5 R4.1 5.10, the owner's ruling D8): the composer says so
 * above the field while the text looks like a phone number, a handle or a direct-message link. Send stays
 * enabled: it is advice, not a gate, and the server remains the authority, so a miss here still gets the
 * server's own refusal and a hit here is never a refusal by itself.
 *
 * A port of `findContactInfo` in blendn-admin `lib/moderation/contact-info.ts`, which says it runs on the
 * client before send and on the server before persist "so the warning a sender sees and the flag a moderator
 * sees can never disagree". Keep the two in step: `__tests__/contactWarning.test.ts` pins the shared cases.
 * Addresses are deliberately not detected ("Meet at the Blue Door on MG Road" is what a room is for).
 */

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', nought: '0',
  one: '1', won: '1',
  two: '2', to: '2', too: '2',
  three: '3', tree: '3',
  four: '4', for: '4', fore: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8', ate: '8',
  nine: '9',
}

/** Keyed on the platform, not on `@word`: "@priya you coming?" is a room working as intended. */
const PLATFORMS = [
  'insta', 'instagram', 'snap', 'snapchat', 'whatsapp', 'whats app', 'wa',
  'telegram', 'tg', 'signal', 'discord', 'twitter', 'x dot com',
  'facebook', 'fb', 'linkedin', 'tiktok',
]

const CONTACT_LINKS = /\b(wa\.me|t\.me|ig\.me|m\.me|snapchat\.com\/add|api\.whatsapp\.com)/i

const LEET_TO_LETTER: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' }

/** Seven digits is the shortest thing that can be a real number anywhere (the server's own floor). */
const MIN_PHONE_DIGITS = 7

const collapseRuns = (text: string) => text.replace(/(.)\1{2,}/gi, '$1$1')
const unleet = (token: string) => token.replace(/[013457]/g, (c) => LEET_TO_LETTER[c] ?? c)

function digitWordFor(token: string): string | undefined {
  const collapse = (t: string) => t.replace(/(.)\1+/g, '$1')
  for (const form of [token, collapse(token), unleet(token), collapse(unleet(token))]) {
    const digit = DIGIT_WORDS[form]
    if (digit) return digit
  }
  return undefined
}

/** Digit runs, separated by spaces: a run only grows while somebody is reciting digits. */
function digitsIn(text: string): string {
  const normalised = text.toLowerCase().replace(/[|!]/g, '1').replace(/[@]/g, 'a').replace(/\$/g, 's')
  let out = ''
  for (const token of normalised.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^\d+$/.test(token)) {
      out += token
      continue
    }
    const asDigit = digitWordFor(token)
    out += asDigit ?? ' '
  }
  return out
}

export type ContactKind = 'phone' | 'handle' | 'link'

const HINTS: Record<ContactKind, string> = {
  phone: 'This looks like a phone number.',
  handle: 'This looks like a social media handle.',
  link: 'This looks like a direct-message link.',
}

/** Every distinct kind of contact detail in `content`, or none. */
export function findContactKinds(content: string): ContactKind[] {
  if (!content?.trim()) return []
  const kinds: ContactKind[] = []
  if (
    digitsIn(content)
      .split(/\s+/)
      .some((run) => run.length >= MIN_PHONE_DIGITS)
  ) {
    kinds.push('phone')
  }
  const flat = collapseRuns(content.toLowerCase()).replace(/[^a-z0-9\s.]/g, ' ')
  if (PLATFORMS.some((p) => new RegExp(`\\b${p}\\b`).test(flat))) kinds.push('handle')
  if (CONTACT_LINKS.test(content)) kinds.push('link')
  return kinds
}

/**
 * Where it is typed. A room (an event's, a place's or a Blend's, all anonymous) and a crew's room remove the message:
 * the server hides it on write. A DM does not: blendn-admin lib/dm-moderation.ts flags contact details and lets the
 * message through ("flagged, never refused"), read by a person only if somebody reports it, so its sentence must not
 * say "removed".
 */
export type WarningAudience = 'anonymous' | 'crew' | 'dm'

const WHAT_HAPPENS: Record<WarningAudience, string> = {
  anonymous: 'This room is anonymous — a message with contact details is removed before anyone sees it.',
  crew: 'A message with contact details is removed before anyone else sees it.',
  dm: 'It will send. Nobody reads messages here unless somebody reports one.',
}

/** The sentence above the composer for what is being typed, or null when nothing in it looks like contact details. */
export function contactWarning(content: string, audience: WarningAudience): string | null {
  const kinds = findContactKinds(content)
  if (!kinds.length) return null
  return `${kinds.map((k) => HINTS[k]).join(' ')} ${WHAT_HAPPENS[audience]}`
}
