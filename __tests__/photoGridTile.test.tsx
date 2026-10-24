/**
 * DS-08 (D-M8): in a 150 pt tile at large text, "Main" (top-left) and the remove × (top-right) met in the top band. Past
 * the roomy font scale, Main moves to the bottom-left, above the "Blurred for others" note when there is one.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

import { PhotoFace } from '../components/profile/PhotoGridTile'

const window = Dimensions.get('window')
const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
afterEach(() => Dimensions.set({ window, screen: window }))
const main = () => StyleSheet.flatten(screen.getByTestId('tile-main', { includeHiddenElements: true }).props.style)
const face = (blurred = false) => (
  <PhotoFace uri="https://cdn/p0.jpg" label="Photo 1 of 3" main blurred={blurred} onRemove={jest.fn()} removeLabel="Remove photo 1" removeDisabled={false} />
)

it('at 360 dp and 1.3 Main sits bottom-left, never in the ×’s corner band', async () => {
  await at(360, 1.3)
  await render(face())
  expect(main().bottom).toBeDefined()
  expect(main().top).toBeUndefined()
  expect(main().left).toBeDefined()
})

it('with the blurred note, Main sits above it', async () => {
  await at(360, 1.3)
  await render(face(true))
  const note = StyleSheet.flatten(screen.getByTestId('tile-blur-note', { includeHiddenElements: true }).props.style)
  expect(main().bottom).toBeGreaterThan(note.bottom as number)
})

it('at the default size it is top-left, as the frame draws it', async () => {
  await at(402, 1)
  await render(face())
  expect(main().top).toBeDefined()
  expect(main().bottom).toBeUndefined()
})
