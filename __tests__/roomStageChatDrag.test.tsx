/*
 * The Chat tab's feed scrolls down to read back, and a downward drag on the stage closes the room (Flow 5 C1b). On Chat the
 * stage's drag-to-close is off, so reading back never drags the room away; the chevron, Back and VoiceOver's escape close
 * it. Control: People keeps the drag.
 */
import { act, render } from '@testing-library/react-native'
import React from 'react'

import { RoomStage, useStage } from '../components/blendn/RoomStage'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))

type Stage = ReturnType<typeof useStage>
const seen: { stage: Stage | null } = { stage: null }
function Probe({ onStage }: { onStage: (s: Stage) => void }) {
  onStage(useStage())
  return null
}

const enabled = () => (seen.stage!.pan as unknown as { config: { enabled?: boolean } }).config.enabled !== false

it('drags to close on People, not on Chat, and again on People', async () => {
  await render(
    <RoomStage onClosed={jest.fn()}>
      <Probe onStage={(s) => (seen.stage = s)} />
    </RoomStage>,
  )
  expect(enabled()).toBe(true)
  await act(async () => seen.stage!.setDragToClose(false))
  expect(enabled()).toBe(false)
  await act(async () => seen.stage!.setDragToClose(true))
  expect(enabled()).toBe(true)
})
