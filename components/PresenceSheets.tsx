import { H } from '../lib/haptics'
import { PRESENCE_COPY } from '../lib/presence'
import { Sheet } from './ds/Sheet'

/**
 * What the presence monitor says (guidelines/flow-7 sheet frames 08 and 09), on the one DS Sheet.
 *
 * "Still at the event?" is a question that has to be answered: no handle, a scrim and a drag that do nothing, system
 * back ignored, no Cancel. Tapping the backdrop to make it go away would read as "I'm still here" while recording
 * nothing, so the reprieve would never start and the same prompt would return two minutes later. "I'm still here" plays
 * nothing; "Check me out" is the secondary the frame draws, with the destructive tick the sheet's annotation names (it
 * takes you out of the room).
 *
 * "Checked out" is calm and unsolicited: no haptic, one action. They can check back in any time they are there.
 */
export function PresenceSheets({
  asking,
  onStay,
  onLeave,
  notice,
  onNoticeDone,
}: {
  asking: boolean
  onStay: () => void
  onLeave: () => void
  notice: boolean
  onNoticeDone: () => void
}) {
  return (
    <>
      <Sheet
        visible={asking}
        onClose={() => {}}
        dismissible={false}
        icon="map-pin"
        title={PRESENCE_COPY.ask.title}
        body={PRESENCE_COPY.ask.body}
        testID="presence-ask"
        actions={[
          { label: PRESENCE_COPY.ask.stay, kind: 'strong', pressHaptic: false, onPress: onStay },
          { label: PRESENCE_COPY.ask.leave, kind: 'secondary', pressHaptic: () => H.destructive(), onPress: onLeave },
        ]}
      />
      <Sheet
        visible={notice}
        onClose={onNoticeDone}
        icon="door-open"
        title={PRESENCE_COPY.autoCheckedOut.title}
        body={PRESENCE_COPY.autoCheckedOut.body}
        testID="presence-notice"
        actions={[{ label: 'Got it', kind: 'strong', pressHaptic: false, onPress: onNoticeDone }]}
      />
    </>
  )
}
