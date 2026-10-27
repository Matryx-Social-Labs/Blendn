import { router } from 'expo-router'
import { useState } from 'react'

import { isGate, refusalTitle } from '../../lib/crewsScreens'
import { ONBOARDING_ROUTES } from '../../lib/onboarding'
import { Sheet } from '../ds/Sheet'

/** What the server refused, in its own words. */
export type CrewRefusal = { text: string; errorCode?: string | null }

/**
 * A crew route's refusal (guidelines/flow-10 `refusal`): the caps, the daily
 * limit, a full crew and the 18+ gate. The body is the server's sentence,
 * word for word; the title only says which door was shut. One action, named
 * for what it does. No haptic from the sheet: the control that asked plays
 * `H.error` when the answer came back.
 */
export function CrewRefusalSheet({ refusal, onClose }: { refusal: CrewRefusal | null; onClose: () => void }) {
  // The words stay while the sheet leaves: `refusal` is already null by then.
  const [last, setLast] = useState<CrewRefusal | null>(refusal)
  if (refusal && refusal !== last) setLast(refusal)
  const gate = !!last && isGate(last.text, last.errorCode)
  return (
    <Sheet
      visible={!!refusal}
      onClose={onClose}
      icon="users"
      title={last ? refusalTitle(last.text, last.errorCode) : undefined}
      body={last?.text}
      actions={[
        gate
          ? {
              label: 'Finish setting up',
              kind: 'lit',
              onPress: () => {
                onClose()
                router.push(ONBOARDING_ROUTES.basics as never)
              },
            }
          : { label: 'OK', kind: 'lit', onPress: onClose },
      ]}
      testID="crew-refusal"
    />
  )
}
