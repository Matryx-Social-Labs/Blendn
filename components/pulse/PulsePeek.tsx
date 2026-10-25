import { EventCard, type EventCardKind } from '../ds/EventCard'
import { LongPressMenu, type MenuItem } from '../ds/ContextMenu'
import type { Rect } from '../ds/chatShared'
import type { BlendnEvent } from '../../lib/api'
import { homeCardProps } from '../../lib/pulse'
import { peekActions, type PeekAction } from '../../lib/pulsePeek'

export type Peek = { event: BlendnEvent; anchor: Rect; kind: EventCardKind }

const ITEM: Record<PeekAction, Pick<MenuItem, 'icon' | 'label'>> = {
  save: { icon: 'bookmark', label: 'Save' },
  unsave: { icon: 'bookmark', label: 'Remove from saved' },
  share: { icon: 'share', label: 'Share' },
  preview: { icon: 'arrow-up-right', label: 'Preview' },
  checkIn: { icon: 'door-open', label: 'Check in' },
  checkOut: { icon: 'log-out', label: 'Check out' },
}

/**
 * The long-press peek (Flow 3 `home` 16–18, motion #36): the card lifts to 1.03 over the dim, and under it the menu:
 * Save, Share, Preview, and Check in or Check out where they apply. The lifted card is the DS `EventCard` at the card's
 * own frame; `LongPressMenu` owns the lift, the dim, the springs, Reduce Motion, and running an item once the menu has
 * left. The hold's `H.longPress` is the card's; an item plays nothing of its own (its outcome carries it).
 *
 * Check in is "Check in" in the menu and the pass's hold behind it, as everywhere (Flow 4): this never checks anyone in.
 */
export function PulsePeek({
  peek,
  now,
  withDistance,
  interested,
  checkedIn,
  withinFence,
  onAction,
  onClose,
}: {
  peek: Peek | null
  now: number
  withDistance: boolean
  interested: boolean
  checkedIn: boolean
  withinFence: boolean
  onAction: (action: PeekAction, event: BlendnEvent) => void
  onClose: () => void
}) {
  const event = peek?.event
  const items: MenuItem[] = event
    ? peekActions({ interested, checkedIn, withinFence }).map((action) => ({
        ...ITEM[action],
        destructive: false,
        onPress: () => onAction(action, event),
      }))
    : []
  const card = event ? homeCardProps(event, now, withDistance) : null
  return (
    <LongPressMenu visible={!!peek} anchor={peek?.anchor ?? null} side="left" items={items} onClose={onClose} testID="pulse-peek">
      {card && peek ? (
        <EventCard
          kind={peek.kind}
          title={card.title}
          time={card.time}
          venue={card.venue}
          distance={card.distance}
          here={card.here}
          going={card.going}
          cover={card.cover}
          style={peek.kind === 'row' ? { width: peek.anchor.width } : { width: peek.anchor.width, height: peek.anchor.height }}
        />
      ) : null}
    </LongPressMenu>
  )
}
