/*
 * What the P3 chat components share: the person a chat draws, the bubble's
 * geometry, the time's type, the reactions' spoken names, and the pure rules
 * the bubble applies (emoji-only, links, the swipe-to-reply drag). Values the
 * component pages draw that `design/tokens.json` does not carry are named here
 * once, with the page they come from.
 */
import type { ChatReaction } from '../../lib/chatReactions'
import { COLOR, FONT_FAMILY } from '../../lib/design/tokens'
import { font } from './shared'

/**
 * Someone in a chat, as the room shows them: the name (the pseudonym, or the
 * real name once revealed), and a photo only where the room names them to you.
 * `pseudonym` seeds the creature when `name` is a placeholder ("Attendee").
 */
export type ChatPerson = { name: string; pseudonym?: string; photoUri?: string }

/**
 * Their `<Avatar>` props: the photo when the room shows it, otherwise their
 * creature. (Typed by inference, not by importing Avatar's props: an import
 * here would read as Avatar being wired to a screen.)
 */
export function avatarOf<S extends number>(person: ChatPerson, size: S) {
  return person.photoUri
    ? { kind: 'photo' as const, uri: person.photoUri, size }
    : { kind: 'creature' as const, pseudonym: person.pseudonym ?? person.name, size }
}

/** A frame in the window (`measureInWindow`): where a menu anchors, where a photo opens from. */
export type Rect = { x: number; y: number; width: number; height: number }

/**
 * The bubble (ChatBubble page): radius 20 with a 6 pt tail on the sender's
 * side of a group's last bubble; a 32 pt creature beside an inbound room
 * group; 86% of the row in a room, 82% in a DM.
 */
export const BUBBLE = {
  radius: 20,
  tail: 6,
  avatar: 32,
  maxWidth: { room: '86%', dm: '82%' },
} as const

/** The time under a group: Geist Mono 500 12/16, tabular, in `textTertiary` (chat.js `timeCss`). */
export const timeFont = (bold: boolean) => ({
  ...font('caption', bold, FONT_FAMILY.mono[500]),
  fontVariant: ['tabular-nums' as const],
  color: COLOR.textTertiary,
})

/** How a screen reader says each of the six (ReactionBar page: "React, thumbs up"). */
const REACTION_NAME: Record<ChatReaction, string> = {
  '👍': 'thumbs up',
  '❤️': 'heart',
  '😂': 'laughing',
  '😮': 'surprised',
  '😢': 'sad',
  '🔥': 'fire',
}
export const reactionName = (emoji: string) => REACTION_NAME[emoji as ChatReaction] ?? emoji

/** "1 vote", "7 votes". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/*
 * One to three emoji and nothing else render at 32 pt with no bubble
 * (R3-D5 5.11). An emoji is a pictograph with its variation selector, skin
 * modifier and joined parts, a flag (two regional indicators) or a keycap;
 * not ©, ® or ™, which are pictographs that read as text.
 */
const EMOJI =
  '(?:(?![\\u00A9\\u00AE\\u2122])\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D\\p{Extended_Pictographic})*' +
  '|\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3)'
const EMOJI_ONLY = new RegExp(`^${EMOJI}{1,3}$`, 'u')
export const emojiOnly = (text: string) => EMOJI_ONLY.test(text.replace(/\s/g, ''))

/*
 * Links are tappable text, never a preview (R3-D5 5.11, R10): anything with a
 * scheme, or a bare domain ending on a common TLD (bbc.co.uk whole, never cut
 * to bbc.co), with a path that does not swallow the sentence's closing
 * punctuation (a path's own parenthesis is kept); never an email's domain.
 * ponytail: the TLD list keeps "ok.thanks" and "Dr.Smith" as words; the
 * server, which counts links, is the authority, and its rule replaces this
 * when it ships one.
 */
const PATH_END = `[^\\s.,;:!?)\\]'"]`
const LINK = new RegExp(
  `(?<![@\\w.])(?:https?:\\/\\/[^\\s]*${PATH_END}|(?:[a-z0-9-]+\\.)+(?:com|in|org|net|io|co|uk|au|app|me|ly|gg|link|xyz|info|ai|dev|live|club|events)(?![\\w-]|\\.\\w)(?:\\/[^\\s]*${PATH_END})?)`,
  'gi'
)
export type TextPart = { text: string; url?: string }
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(LINK)) {
    const start = m.index ?? 0
    // A path's own closing parenthesis (Rumours_(album)) is kept; a sentence's is not.
    const open = m[0].split('(').length - m[0].split(')').length
    const link = open > 0 && text[start + m[0].length] === ')' ? `${m[0]})` : m[0]
    const url = /^https?:\/\//i.test(link) ? link : `https://${link}`
    if (start > at) parts.push({ text: text.slice(at, start) })
    // A link whose host can't be told for certain stays words: nothing to tap.
    parts.push(linkHost(url) ? { text: link, url } : { text: link })
    at = start + link.length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}

/**
 * "toit.in" from "https://toit.in/vinyl": the host the link really goes to,
 * from the parsed URL — never the link's own text — or null when it is not an
 * http(s) link with a plain host. Null too for any authority where parsers
 * disagree about the host: userinfo (`toit.in@evil.example`), a backslash
 * (`evil.example\@toit.in` opens evil.example in a browser, while React
 * Native's URL shim reads toit.in), whitespace or invisible characters. Such a
 * link is not offered at all, so the name on the sheet is always where it goes.
 * TODO(owner decision): show an IDN host as Unicode or as punycode (xn--…);
 * this returns whatever the runtime's URL gives, unchanged.
 */
export function linkHost(url: string): string | null {
  const scheme = /^(https?):\/\//i.exec(url)?.[1]
  const authority = url.slice((scheme?.length ?? 0) + 3).split(/[/?#]/)[0]
  if (!scheme || !authority || /[@\\\s\p{Cc}\p{Cf}]/u.test(authority)) return null
  // The clean authority alone, parsed: React Native's URL shim misreads an `@`
  // later in the path (medium.com/@someone) as userinfo; this way both agree.
  try {
    return new URL(`${scheme}://${authority}/`).hostname || null
  } catch {
    return null
  }
}

/** #35: the drag tracks 1:1 to 56 pt, arms there, then rubber-bands at 0.5× to 96 pt. */
export const REPLY_SWIPE = { trigger: 56, max: 96, rubber: 0.5 } as const

/** The bubble's offset for a finger `dx` along: rightward only. A worklet, for the UI thread. */
export function replyOffset(dx: number): number {
  'worklet'
  if (dx <= 0) return 0
  if (dx <= REPLY_SWIPE.trigger) return dx
  return Math.min(REPLY_SWIPE.max, REPLY_SWIPE.trigger + (dx - REPLY_SWIPE.trigger) * REPLY_SWIPE.rubber)
}
