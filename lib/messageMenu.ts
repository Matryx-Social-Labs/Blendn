/**
 * What a long-press offers, for every kind of message (ROUND3 D 5.2). Pure,
 * so the table is pinned by a test rather than spread across two screens.
 *
 * | Message                                   | Reaction bar | Actions                                        |
 * |-------------------------------------------|--------------|------------------------------------------------|
 * | Theirs, in a room                         | six emoji    | {pseudonym} › · Reply · Copy · Report… · Block… |
 * | Yours, in a room                          | six emoji    | Reply · Copy                                   |
 * | Still sending                             | —            | Copy                                           |
 * | A room that refuses writes                | none         | Copy · Report… (theirs)                        |
 * | Theirs, in a DM                           | none         | Reply · Copy · Report…                         |
 * | Yours, in a DM                            | none         | Reply · Copy                                   |
 * | Not sent                                  | —            | the Not sent sheet                             |
 * | Removed, a broadcast, a poll, a day line  | —            | no menu                                        |
 */

export type MenuItemKind = 'person' | 'reply' | 'copy' | 'report' | 'block'

export type MessageMenu =
  /** Nothing opens: say so with silence (removed placeholders, broadcasts, polls). */
  | { kind: 'none' }
  /** Try again · Copy · Delete · Cancel. */
  | { kind: 'failed' }
  | { kind: 'menu'; reactions: boolean; items: MenuItemKind[] }

export type MenuInput = {
  surface: 'room' | 'dm'
  mine: boolean
  state: 'sent' | 'sending' | 'failed' | 'removed'
  /** A person's message, or something the room says (a broadcast, a poll). */
  speech: boolean
  /** Muted, locked, closed or left: the server refuses reactions too. */
  refusesWrites?: boolean
}

export function messageMenu({ surface, mine, state, speech, refusesWrites = false }: MenuInput): MessageMenu {
  if (!speech || state === 'removed') return { kind: 'none' }
  if (state === 'failed') return { kind: 'failed' }
  if (state === 'sending') return { kind: 'menu', reactions: false, items: ['copy'] }
  if (surface === 'dm') return { kind: 'menu', reactions: false, items: mine ? ['reply', 'copy'] : ['reply', 'copy', 'report'] }
  if (refusesWrites) return { kind: 'menu', reactions: false, items: mine ? ['copy'] : ['copy', 'report'] }
  return mine
    ? { kind: 'menu', reactions: true, items: ['reply', 'copy'] }
    : { kind: 'menu', reactions: true, items: ['person', 'reply', 'copy', 'report', 'block'] }
}
