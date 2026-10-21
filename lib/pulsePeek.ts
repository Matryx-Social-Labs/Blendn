/**
 * What the Pulse's long-press peek offers (Flow 3 `home` 16–18), in the frame's order: Save, Share, Preview, then Check in
 * (inside the fence: it opens the pass, always the hold) or Check out (checked in: it confirms first). Pure, so each rule
 * is tested; the screen decides what each does.
 */
export type PeekAction = 'save' | 'unsave' | 'share' | 'preview' | 'checkIn' | 'checkOut'

export function peekActions({ interested, checkedIn, withinFence }: { interested: boolean; checkedIn: boolean; withinFence: boolean }): PeekAction[] {
  return [
    interested ? 'unsave' : 'save',
    'share',
    'preview',
    ...(withinFence && !checkedIn ? (['checkIn'] as const) : []),
    ...(checkedIn ? (['checkOut'] as const) : []),
  ]
}

/** The words an event is shared in: its name, where, and the address. */
export function eventShareText(event: { title: string; venue_name?: string | null; venueName?: string | null; address?: string | null }): string {
  return [event.title, event.venue_name ?? event.venueName, event.address].filter(Boolean).join('\n')
}
