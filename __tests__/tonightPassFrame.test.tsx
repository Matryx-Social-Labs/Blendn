/**
 * Tonight reports where its docked pass is, so the pour can fill exactly it
 * (Flow 4 delta R2-D1, "success": the gradient floods up through the pass).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { TonightView } from '../components/blendn/TonightView'

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
// A cover is an image from the API host; none is drawn here.
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/blendn/RoomStage', () => ({
  useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16 }),
}))

const layout = (x: number, y: number, width: number, height: number) => ({ nativeEvent: { layout: { x, y, width, height } } })

it('is the dock’s place plus the pass’s place in it', async () => {
  const onPassFrame = jest.fn()
  const event = { id: 'e1', title: 'Vinyl Night', venue: 'Toit', photo: null, hereCount: 3, tasteMatchCount: null, goingCount: null } as never
  await render(
    <TonightView
      events={[]}
      loading={false}
      error={false}
      onRetry={() => {}}
      insideEvent={event}
      checkingIn={false}
      onPassFrame={onPassFrame}
      onOpenEvent={() => {}}
      onSeeAll={() => {}}
      onBrowse={() => {}}
      onCheckIn={() => {}}
      topInset={0}
      bottomInset={34}
    />
  )
  await fireEvent(screen.getByTestId('tonight-pass-dock'), 'layout', layout(0, 560, 393, 292))
  await fireEvent(screen.getByTestId('tonight-pass-slot'), 'layout', layout(12, 4, 369, 234))
  expect(onPassFrame).toHaveBeenLastCalledWith({ x: 12, y: 564, width: 369, height: 234 })
})
