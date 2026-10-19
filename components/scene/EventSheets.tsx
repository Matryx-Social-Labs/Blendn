import { Sheet } from '../ds/Sheet'
import { TextArea, TextField } from '../ds/TextField'
import { CONTROL } from '../../lib/theme'

/** The multi-line fields start short (two controls tall): a keyboard leaves them little room. */
const AREA_MIN_HEIGHT = CONTROL.lg * 2

/** The server refuses an announcement over 1,000 characters (`announce/route.ts`). */
export const ANNOUNCEMENT_LIMIT = 1000

/**
 * The announcement composer: the app's own Sheet, which caps at the keyboard's
 * top and scrolls its content to the focused field, so the field being typed in
 * and Send are both on screen with the keyboard up. It was a transparent Modal
 * with the card centred in the window, where the keyboard covered the buttons.
 * The field carries the counter and Send the spinner and the empty-message
 * refusal. Not in any frame.
 */
export function AnnouncementSheet({
  visible,
  text,
  onChangeText,
  sending,
  onSend,
  onClose,
}: {
  visible: boolean
  text: string
  onChangeText: (text: string) => void
  sending: boolean
  onSend: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send announcement"
      body="This message is broadcast to everyone in the event chat."
      actions={[
        { label: 'Send', kind: 'strong', onPress: onSend, loading: sending, disabled: !text.trim(), testID: 'announcement-send' },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="announcement-sheet"
    >
      <TextArea value={text} onChangeText={onChangeText} placeholder="Enter your announcement…" limit={ANNOUNCEMENT_LIMIT} minHeight={AREA_MIN_HEIGHT} autoFocus testID="announcement-input" />
    </Sheet>
  )
}

/** The event editor, on the same Sheet: three fields, Save refused without a title. */
export function EditEventSheet({
  visible,
  title,
  onChangeTitle,
  shortDescription,
  onChangeShortDescription,
  description,
  onChangeDescription,
  saving,
  onSave,
  onClose,
}: {
  visible: boolean
  title: string
  onChangeTitle: (text: string) => void
  shortDescription: string
  onChangeShortDescription: (text: string) => void
  description: string
  onChangeDescription: (text: string) => void
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit event"
      body="Changes are visible to everyone viewing this event."
      actions={[
        { label: 'Save', kind: 'strong', onPress: onSave, loading: saving, disabled: !title.trim(), testID: 'edit-save' },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="edit-sheet"
    >
      <TextField label="Title" value={title} onChangeText={onChangeTitle} placeholder="Title" limit={120} testID="edit-title" />
      <TextField label="Short description" value={shortDescription} onChangeText={onChangeShortDescription} placeholder="Short description" limit={200} testID="edit-short" />
      <TextArea label="Description" value={description} onChangeText={onChangeDescription} placeholder="Description" limit={2000} minHeight={AREA_MIN_HEIGHT} testID="edit-description" />
    </Sheet>
  )
}
