/**
 * The note in the Connect sheet belongs to one person (SCRUM-912).
 *
 * `SenderCard` mounts ONE ConnectSheet for every sender in a chat, so the note
 * state outlived the person it was written to: the next person's sheet opened
 * pre-filled, and a tap sent a stranger words meant for someone else.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('../components/ds/Sheet', () => ({
  Sheet: (p: { visible: boolean; title: string; children: unknown; actions: { label: string; onPress: () => void }[] }) => {
    const React = require('react')
    const { Pressable, Text, View } = require('react-native')
    return p.visible
      ? React.createElement(
          View,
          null,
          React.createElement(Text, null, p.title),
          p.children,
          p.actions.map((a) => React.createElement(Pressable, { key: a.label, onPress: a.onPress, testID: `action-${a.label}` }, React.createElement(Text, null, a.label)))
        )
      : null
  },
}))
jest.mock('../components/ds/TextField', () => ({
  TextArea: (p: { value: string; onChangeText: (t: string) => void; testID: string }) => {
    const React = require('react')
    const { TextInput } = require('react-native')
    return React.createElement(TextInput, { value: p.value, onChangeText: p.onChangeText, testID: p.testID })
  },
}))

import { ConnectSheet } from '../components/grid/ConnectSheet'

const noop = () => undefined
const sheet = (visible: boolean, displayName: string, onSend: (m: string) => void = noop) => (
  <ConnectSheet visible={visible} displayName={displayName} onSend={onSend} onDismiss={noop} />
)
const note = () => screen.getByTestId('connect-message').props.value

describe('the Connect note starts empty for every opening', () => {
  it('is empty when the sheet opens for a different person after a send', async () => {
    // Arrange: a note typed for the first person, sent, the sheet closed.
    const view = await render(sheet(true, 'Rushing Tiger'))
    await fireEvent.changeText(screen.getByTestId('connect-message'), 'Hello_B_from_P')
    await view.rerender(sheet(false, 'Rushing Tiger'))
    // Act: the same mounted sheet opens for somebody else.
    await view.rerender(sheet(true, 'Quiet Birch'))
    // Assert
    expect(note()).toBe('')
  })

  it('is empty when reopened after a cancel', async () => {
    const view = await render(sheet(true, 'Rushing Tiger'))
    await fireEvent.changeText(screen.getByTestId('connect-message'), 'half a thought')
    await view.rerender(sheet(false, 'Rushing Tiger'))
    await view.rerender(sheet(true, 'Rushing Tiger'))
    expect(note()).toBe('')
  })

  it('keeps the note while the sheet stays open (a refused send keeps what was typed)', async () => {
    const view = await render(sheet(true, 'Rushing Tiger'))
    await fireEvent.changeText(screen.getByTestId('connect-message'), 'still here')
    await view.rerender(sheet(true, 'Rushing Tiger'))
    expect(note()).toBe('still here')
  })

  it('is empty when the person changes while the sheet stays open', async () => {
    const view = await render(sheet(true, 'Rushing Tiger'))
    await fireEvent.changeText(screen.getByTestId('connect-message'), 'for the tiger')
    await view.rerender(sheet(true, 'Quiet Birch'))
    expect(note()).toBe('')
  })
})
