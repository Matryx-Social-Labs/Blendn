import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { SceneAttendees, SceneByline } from '../components/scene/SceneSections'
import { MAX_FONT_SCALE } from '../lib/design/tokens'
import { AX_XXXL, atScale, resetScale, uncapped } from './helpers/togetherAx'

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

describe('at AX XXXL (TG-03)', () => {
  beforeEach(() => atScale(AX_XXXL))
  afterEach(resetScale)

  it('a long organiser name takes two lines at the meta cap; "here now" is capped too', async () => {
    const host = 'The Bangalore Natural Wine and Vinyl Appreciation Society'
    await render(<SceneByline host={host} hereNow={483} />)
    expect(uncapped(screen.toJSON() as never)).toEqual([])
    const line = screen.getByText(/^By /)
    expect(line.props.numberOfLines).toBe(2)
    expect(line.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  })
})
