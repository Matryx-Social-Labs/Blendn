import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { SceneAttendees, SceneByline } from '../components/scene/SceneSections'

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }))

describe('the byline\'s "here now"', () => {
  it('is printed at five and up', async () => {
    await render(<SceneByline host="Toit" hereNow={5} />)
    expect(screen.getByText('5 here now')).toBeTruthy()
  })
  it('is not printed under five: just the host, or nothing', async () => {
    const view = await render(<SceneByline host="Toit" hereNow={4} />)
    expect(screen.queryByText(/here now/)).toBeNull()
    expect(screen.getByTestId('scene-byline')).toHaveTextContent(/By Toit/)
    await view.rerender(<SceneByline host={null} hereNow={3} />)
    expect(screen.queryByTestId('scene-byline')).toBeNull()
  })
})

describe('attendees', () => {
  it('prints the count and the stack from five', async () => {
    await render(<SceneAttendees count={12} seed="e1" label="Going" />)
    expect(screen.getByRole('header', { name: 'Going, 12' })).toBeTruthy()
  })
  it('under five is the bare heading "Attendees": no number, no stack', async () => {
    await render(<SceneAttendees count={4} seed="e1" label="Going" />)
    expect(screen.getByRole('header', { name: 'Attendees' })).toBeTruthy()
    expect(screen.getByTestId('scene-attendees')).not.toHaveTextContent(/\d/)
  })
})
