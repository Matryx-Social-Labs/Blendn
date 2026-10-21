/* Banner's `error` kind: a refused form (Flow 1 sign-in, forgot). The destructive tint, the alert glyph, told at once. */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Banner } from '../components/ds/Banner'
import { COLOR } from '../lib/design/tokens'

it('is an alert on the destructive tint, carrying the sentence', async () => {
  await render(<Banner kind="error" text="Invalid email or password" testID="b" />)
  const banner = screen.getByTestId('b')
  expect(banner.props.accessibilityRole).toBe('alert')
  expect(StyleSheet.flatten(banner.props.style).backgroundColor).toBe(COLOR.destructiveTint)
  expect(screen.getByText('Invalid email or password').props.accessibilityLiveRegion).toBe('assertive')
})

it('other kinds are not alerts', async () => {
  await render(<Banner kind="info" text="Hello" testID="b" />)
  expect(screen.getByTestId('b').props.accessibilityRole).toBeUndefined()
})
