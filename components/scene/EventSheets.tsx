import { Sheet } from '../ds/Sheet'
import { TextArea, TextField } from '../ds/TextField'
import { SIZE } from '../../lib/design/tokens'

/** The multi-line fields start short (two controls tall): a keyboard leaves them little room. */
const AREA_MIN_HEIGHT = SIZE.primary * 2

/** The server refuses an announcement over 1,000 characters (`announce/route.ts`); the edit's limits are its zod schema's. */
export const ANNOUNCEMENT_LIMIT = 1000
export const EDIT_LIMITS = { title: 120, shortDescription: 200, description: 2000 } as const

/** Over its limit, as the server's zod `max()` counts it: UTF-16 units of what is sent, trimmed (an emoji is two). */
export const isOver = (value: string, limit: number) => value.trim().length > limit
/** The counter's unit is the limit's: what is sent (trimmed), in UTF-16 units. */
const sent = (value: string) => value.trim().length
const overLine = (limit: number) => `Over the ${limit}-character limit.`

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
  onDismissed,
}: {
  visible: boolean
  text: string
  onChangeText: (text: string) => void
  sending: boolean
  onSend: () => void
  onClose: () => void
  /** Once the sheet has left the screen: what must wait for it (the result tray) starts here. */
  onDismissed?: () => void
}) {
  const over = isOver(text, ANNOUNCEMENT_LIMIT)
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      title="Send announcement"
      body="This message is broadcast to everyone in the event chat."
      actions={[
        { label: 'Send', kind: 'strong', onPress: onSend, loading: sending, disabled: !text.trim() || over, testID: 'announcement-send' },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="announcement-sheet"
    >
      <TextArea value={text} onChangeText={onChangeText} placeholder="Enter your announcement…" limit={ANNOUNCEMENT_LIMIT} measure={sent} error={over ? overLine(ANNOUNCEMENT_LIMIT) : undefined} minHeight={AREA_MIN_HEIGHT} autoFocus testID="announcement-input" />
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
  onDismissed,
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
  /** Once the sheet has left the screen: what must wait for it (the result tray) starts here. */
  onDismissed?: () => void
}) {
  const overTitle = isOver(title, EDIT_LIMITS.title)
  const overShort = isOver(shortDescription, EDIT_LIMITS.shortDescription)
  const overDescription = isOver(description, EDIT_LIMITS.description)
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      title="Edit event"
      body="Changes are visible to everyone viewing this event."
      actions={[
        { label: 'Save', kind: 'strong', onPress: onSave, loading: saving, disabled: !title.trim() || overTitle || overShort || overDescription, testID: 'edit-save' },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="edit-sheet"
    >
      <TextField label="Title" value={title} onChangeText={onChangeTitle} placeholder="Title" measure={sent} limit={EDIT_LIMITS.title} error={overTitle ? overLine(EDIT_LIMITS.title) : undefined} testID="edit-title" />
      <TextField label="Short description" value={shortDescription} onChangeText={onChangeShortDescription} placeholder="Short description" measure={sent} limit={EDIT_LIMITS.shortDescription} error={overShort ? overLine(EDIT_LIMITS.shortDescription) : undefined} testID="edit-short" />
      <TextArea label="Description" value={description} onChangeText={onChangeDescription} placeholder="Description" limit={EDIT_LIMITS.description} measure={sent} error={overDescription ? overLine(EDIT_LIMITS.description) : undefined} minHeight={AREA_MIN_HEIGHT} testID="edit-description" />
    </Sheet>
  )
}
