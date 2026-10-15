/*
 * The preview harness is dev builds only (docs/redesign/ROUND3.md, D2): a
 * release build that is deep-linked to `/preview/…` lands on `/` instead.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import PreviewLayout from '../app/preview/_layout'

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    Stack: () => <Text>the harness</Text>,
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
  }
})

const g = globalThis as unknown as { __DEV__: boolean }
const dev = g.__DEV__
afterEach(() => {
  g.__DEV__ = dev
})

describe('/preview', () => {
  it('sends a release build to /', async () => {
    g.__DEV__ = false
    await render(<PreviewLayout />)
    expect(screen.getByText('redirect /')).toBeTruthy()
    expect(screen.queryByText('the harness')).toBeNull()
  })

  it('opens in a dev build', async () => {
    g.__DEV__ = true
    await render(<PreviewLayout />)
    expect(screen.getByText('the harness')).toBeTruthy()
  })
})
