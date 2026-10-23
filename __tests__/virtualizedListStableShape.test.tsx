import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { VirtualizedList } from '../components/VirtualizedList'

/*
 * RC drive 3: every signed-in launch with more than twenty Pulse rows landed on the root
 * ErrorBoundary. The Pulse (`app/(tabs)/events.tsx`) re-renders its list when loading
 * ends and the rows pass twenty, and React reuses the same FlatList across that render.
 * FlatList refuses a list whose `onViewableItemsChanged` appears or disappears after
 * mount ("Changing onViewableItemsChanged nullability on the fly is not supported").
 */
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }))
const item = ({ item: row }: { item: { id: string } }) => <Text>{row.id}</Text>

describe('VirtualizedList keeps one shape across renders', () => {
  it('loading, then more than twenty rows, does not throw', async () => {
    const props = { renderItem: item, initialNumToRender: 4 }
    const { rerender } = await render(<VirtualizedList {...props} data={[]} />)
    await expect(rerender(<VirtualizedList {...props} data={rows(25)} />)).resolves.not.toThrow()
    await expect(rerender(<VirtualizedList {...props} data={rows(3)} />)).resolves.not.toThrow()
  })
})
