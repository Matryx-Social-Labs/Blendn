/*
 * <Facepile> and <FaceMark> (guidelines/components/Facepile.html, GridFace's
 * marks): up to five faces at 32 with an 8 pt overlap and an ink cut-out ring,
 * then "+N"; the white arrival ring for one M.settle. One element for a screen
 * reader, never tappable, no haptic.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { FaceMark, Facepile, type Face } from '../components/ds/Facepile'
import { COLOR, SPRING, TYPE } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })

const FACES: Face[] = [
  { kind: 'photo', uri: 'https://example.com/priya.jpg' },
  { kind: 'creature', pseudonym: 'Cosmic Panda' },
  { kind: 'creature', pseudonym: 'Quiet Heron' },
  { kind: 'photo', uri: 'https://example.com/sam.jpg' },
  { kind: 'creature', pseudonym: 'Night Cat' },
  { kind: 'creature', pseudonym: 'Velvet Otter' },
]

beforeEach(() => reduceMotion.mockReturnValue(false))

describe('<Facepile>', () => {
  it('draws up to five faces at 32, each overlapping the last by 8 with an ink ring', async () => {
    await render(<Facepile faces={FACES} testID="p" />)
    expect(query('p-face-4')).toBeTruthy()
    expect(query('p-face-5')).toBeNull()
    expect(flat('p-face-0')).toMatchObject({ width: 32, height: 32 })
    expect(flat('p-slot-1').marginLeft).toBe(-8)
    expect(flat('p-face-0-ring').backgroundColor).toBe(COLOR.ink)
  })

  it('then “+N” in meta, from the total', async () => {
    await render(<Facepile faces={FACES} total={14} />)
    const more = screen.getByText('+9', { includeHiddenElements: true })
    expect(StyleSheet.flatten(more.props.style)).toMatchObject({ fontSize: TYPE.meta.fontSize, color: COLOR.textSecondary })
  })

  it('no overflow, no “+N”; a caller’s text replaces it', async () => {
    await render(<Facepile faces={FACES.slice(0, 3)} />)
    expect(screen.queryByText(/^\+/, { includeHiddenElements: true })).toBeNull()
    await render(<Facepile faces={FACES} total={14} text="and Priya" />)
    expect(screen.getByText('and Priya', { includeHiddenElements: true })).toBeTruthy()
  })

  it('sizes 24 and 40 overlap by a quarter; on a card the ring takes the card’s colour', async () => {
    await render(<Facepile faces={FACES} size={40} ring={COLOR.surface} testID="p" />)
    expect(flat('p-face-0')).toMatchObject({ width: 40 })
    expect(flat('p-slot-1').marginLeft).toBe(-10)
    expect(flat('p-face-0-ring').backgroundColor).toBe(COLOR.surface)
    await render(<Facepile faces={FACES} size={24} testID="p" />)
    expect(flat('p-slot-1').marginLeft).toBe(-6)
  })

  it('is one element, “{N} people here”; the faces are decorative', async () => {
    await render(<Facepile faces={FACES} total={14} />)
    expect(screen.getByLabelText('14 people here')).toBeTruthy()
    await render(<Facepile faces={FACES} total={1} accessibilityLabel="Priya is here" />)
    expect(screen.getByLabelText('Priya is here')).toBeTruthy()
  })

  it('an arrival takes the white ring, on M.settle; Reduce Motion draws it still', async () => {
    await render(<Facepile faces={FACES} highlight={0} testID="p" />)
    expect(flat('p-arrival')).toMatchObject({ borderColor: COLOR.textPrimary })
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
    jest.mocked(Reanimated.withSpring).mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<Facepile faces={FACES} highlight={0} testID="p" />)
    expect(query('p-arrival')).toBeTruthy()
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })
})

describe('<FaceMark>', () => {
  it('is a 24 pt white disc with an ink glyph inside a 2 pt ink ring, hidden from the reader', async () => {
    await render(<FaceMark kind="liked" testID="m" />)
    expect(flat('m')).toMatchObject({ padding: 2, backgroundColor: COLOR.ink })
    expect(flat('m-disc')).toMatchObject({ width: 24, height: 24, backgroundColor: COLOR.textPrimary })
    expect(screen.getByTestId('m', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
  })
})
