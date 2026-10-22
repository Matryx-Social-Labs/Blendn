/**
 * The home's map waits one paint (Android sign-in showed ink for 15 s while its GL surface was created in the same commit as
 * the drawer and its skeleton). `useAfterFirstPaint` is false for the first frames, then true; and HomeShell mounts the map
 * only behind it.
 */
import { act, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { InteractionManager, Text } from 'react-native'

import { useAfterFirstPaint } from '../lib/useAfterFirstPaint'

function Probe() {
  return <Text testID="p">{String(useAfterFirstPaint())}</Text>
}

const frames: (() => void)[] = []
const interactions: (() => void)[] = []
const cancelled = jest.fn()
beforeEach(() => {
  frames.length = 0
  interactions.length = 0
  cancelled.mockClear()
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(((cb: () => void) => frames.push(cb)) as never)
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((() => {}) as never)
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((cb: () => void) => {
    interactions.push(cb)
    return { cancel: cancelled, then: jest.fn(), done: jest.fn() }
  }) as never)
})
afterEach(() => jest.restoreAllMocks())

const runFrame = () => act(async () => frames.splice(0).forEach((f) => f()))
const painted = () => screen.getByTestId('p').props.children

it('is false on the first commit and the next frame, and true only once two frames and the interactions have passed', async () => {
  await render(<Probe />)
  expect(painted()).toBe('false')
  await runFrame()
  expect(painted()).toBe('false')
  await runFrame()
  expect(painted()).toBe('false')
  await act(async () => interactions.splice(0).forEach((f) => f()))
  expect(painted()).toBe('true')
})

it('cancels the wait on unmount, and sets nothing afterwards', async () => {
  const view = await render(<Probe />)
  await runFrame()
  await runFrame()
  await view.unmount()
  expect(cancelled).toHaveBeenCalled()
  await act(async () => interactions.splice(0).forEach((f) => f()))
})

it('HomeShell mounts the map only once it has painted', () => {
  const src = readFileSync(join(__dirname, '../components/home/HomeShell.tsx'), 'utf8')
  expect(src).toContain('const mapPainted = useAfterFirstPaint()')
  expect(src).toContain('mapHeight !== null && mapPainted ? (')
})
