/**
 * Who a person is, as a face, in one place (Flow 5 C5; owner F1 B, 2026-11-12). Every Banter face (rows, requests,
 * facepiles, the DM header) asks this, so the rule cannot drift between surfaces:
 *
 * - anonymous: their creature, seeded on the pseudonym. A creature always means anonymous;
 * - named, no photo: their initial on their hue disc, never a creature;
 * - named, with a photo: that photo;
 * - a host: never drawn as a person (hosts see and are seen as pseudonyms only).
 *
 * `named` is the caller's to know, from the server: a revealed DM (`theyRevealed`), a message request (it carries the
 * sender's name by design). The server already withholds the name and photo of anyone anonymous; this decides the picture.
 */
export type PersonFace = { kind: 'photo'; uri: string } | { kind: 'creature'; pseudonym: string } | { kind: 'initial'; name: string }

export function personFace({ named, name, photo, host = false }: { named: boolean; name: string; photo?: string | null; host?: boolean }): PersonFace {
  if (host || !named) return { kind: 'creature', pseudonym: name }
  const uri = photo?.trim()
  return uri ? { kind: 'photo', uri } : { kind: 'initial', name }
}

/** The first letter or digit, upper-cased where the script has case; an emoji or symbol in front is skipped. */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  const letter = trimmed.match(/[\p{L}\p{N}]/u)?.[0] ?? Array.from(trimmed)[0]
  return letter ? letter.toLocaleUpperCase() : '?'
}

/** Where a message request's two people met, as the server says it (admin #935): `null` when it does not know. */
export type MetIn = { kind: 'event' | 'venue_day'; name: string }

/** "Met in the room at {name}" on the Requests card, or nothing. A venue day's name is already the venue's. */
export function metInLine(metIn: MetIn | null | undefined): string | null {
  if (!metIn || (metIn.kind !== 'event' && metIn.kind !== 'venue_day')) return null
  const name = metIn.name?.trim()
  return name ? `Met in the room at ${name}` : null
}
