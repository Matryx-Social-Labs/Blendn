import type { IconName } from '../components/ui/Icon'

/**
 * "This isn't here any more" (Flow 15 #11): one pattern, the object's own sentence. A crew dissolved, a Blend closed, a
 * conversation ended (its composer is removed, not disabled), a place gone, a rating not open. Never a raw error.
 */
export type GoneKind = 'crew' | 'blend' | 'conversation' | 'venue' | 'rating'

export const GONE: Record<GoneKind, { icon: IconName; title: string; body: string }> = {
  crew: { icon: 'users', title: 'This crew isn’t here any more', body: 'It dissolved. Nobody is told who left.' },
  blend: { icon: 'heart-off', title: 'This Blend closed', body: 'One of you ended it. The room is gone for both.' },
  conversation: { icon: 'message-square-off', title: 'This conversation ended', body: 'You can read it. Nothing more can be sent.' },
  venue: { icon: 'map-pin-off', title: 'This place isn’t on Blend’n any more', body: 'Your nights here stay in your history.' },
  rating: { icon: 'star-off', title: 'Rating isn’t open for this night', body: 'The window closed. Nothing else changes.' },
}
