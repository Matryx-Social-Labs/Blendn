/*
 * "My location" on the home map (SCRUM-667, placeholder look): a labelled
 * 44 pt+ button, filled while the map follows the fix, gone while the drawer
 * is full.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { LocateButton } from '../components/home/LocateButton'
import { CONTROL } from '../lib/theme'

describe('LocateButton', () => {
  it('is a button a screen reader calls "Show my location", at least 44 pt, that does what it says', async () => {
    const onPress = jest.fn()
    await render(<LocateButton visible following bottom={100} onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Show my location' })
    expect(CONTROL.md).toBeGreaterThanOrEqual(44)
    expect(button).toHaveStyle({ width: CONTROL.md, height: CONTROL.md, bottom: 100 })
    fireEvent.press(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says whether the map is following you', async () => {
    await render(<LocateButton visible following bottom={0} onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Show my location' })).toBeSelected()
    await render(<LocateButton visible following={false} bottom={0} onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Show my location' })).not.toBeSelected()
  })

  it('is not there while the drawer is full', async () => {
    await render(<LocateButton visible={false} following bottom={0} onPress={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Show my location' })).toBeNull()
  })
})
