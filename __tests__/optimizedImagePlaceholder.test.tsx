import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { OptimizedImage } from '../components/OptimizedImage'
import { COLOR } from '../lib/design/tokens'

jest.mock('expo-image', () => ({ Image: 'Image' }))
jest.mock('../lib/photoUtils', () => ({ getOptimizedImageUrl: (u: string) => u }))

const drawn = () => JSON.stringify(screen.toJSON())

describe('OptimizedImage while the picture loads (DS #24, #48)', () => {
  it('shows a still shape, not a spinner: nothing loops, so nothing outlives 5 s', async () => {
    await render(<OptimizedImage source="https://example.com/a.jpg" style={{ width: 40, height: 40 }} />)
    expect(drawn()).toContain(COLOR.surfaceSunken)
    expect(drawn()).not.toContain('Loading image')
    expect(drawn()).not.toContain('RCTActivityIndicatorView')
  })

  it('draws no placeholder for an empty source: it never loads, so it would show for ever (SCRUM-404)', async () => {
    await render(<OptimizedImage source="" style={{ width: 40, height: 40 }} />)
    expect(drawn()).not.toContain(COLOR.surfaceSunken)
  })
})
