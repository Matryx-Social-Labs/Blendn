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
 * modifiers and joined parts.
 */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*){1,3}$/u
export const emojiOnly = (text: string) => EMOJI_ONLY.test(text.replace(/\s/g, ''))

/*
 * Links are tappable text, never a preview (R3-D5 5.11, R10): a domain with an
 * optional scheme and path. ponytail: a word like "notes.txt" reads as a link;
 * the server, which counts links, is the authority, and its rule can replace
 * this when it ships one.
 */
const LINK = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi
export type TextPart = { text: string; url?: string }
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(LINK)) {
    const start = m.index ?? 0
    if (start > at) parts.push({ text: text.slice(at, start) })
    parts.push({ text: m[0], url: /^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}` })
    at = start + m[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}
/** "toit.in" from "https://toit.in/vinyl": what the link sheet and its action name. */
export const domainOf = (url: string) => url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]

/** #35: the drag tracks 1:1 to 56 pt, arms there, then rubber-bands at 0.5× to 96 pt. */
export const REPLY_SWIPE = { trigger: 56, max: 96, rubber: 0.5 } as const

/** The bubble's offset for a finger `dx` along: rightward only. A worklet, for the UI thread. */
export function replyOffset(dx: number): number {
  'worklet'
  if (dx <= 0) return 0
  if (dx <= REPLY_SWIPE.trigger) return dx
  return Math.min(REPLY_SWIPE.max, REPLY_SWIPE.trigger + (dx - REPLY_SWIPE.trigger) * REPLY_SWIPE.rubber)
}
