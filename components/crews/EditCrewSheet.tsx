import { useEffect, useState } from 'react'

import { toggleTag, type Crew } from '../../lib/crews'
import {
  bioFits,
  crewPatch,
  editOf,
  intentLine,
  intentOf,
  nameError,
  type CrewEdit,
} from '../../lib/crewsScreens'
import type { CrewPatch } from '../../lib/crewsApi'
import { Sheet } from '../ds/Sheet'
import { NameStep } from './MakeSteps'

const REFUSAL_MS = 400
const BIO_TOO_LONG = 'A crew bio is at most 140 characters'

/**
 * Edit crew (the owner's tool): name, line, Here for, tags and Room for one
 * more — Make a crew's first step on a crew that exists. Save sends only what
 * changed; the server's own sentence about a name or a line comes back under
 * the field (`serverError`), anything else on the Save button. The emblem is
 * the crew's real one: it never changes.
 */
export function EditCrewSheet({
  visible,
  crew,
  saving,
  serverError,
  onSave,
  onClose,
}: {
  visible: boolean
  crew: Crew
  saving: boolean
  /** The server's refusal of the last Save, filed under a field. */
  serverError: { field: 'name' | 'bio'; text: string } | null
  onSave: (patch: CrewPatch) => void
  onClose: () => void
}) {
  // The form starts as the crew is each time the sheet opens (the owner keeps this sheet mounted).
  const [edit, setEdit] = useState<CrewEdit>(() => editOf(crew))
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({})
  const [stuck, setStuck] = useState(false)
  const shown = { name: errors.name ?? (serverError?.field === 'name' ? serverError.text : undefined), bio: errors.bio ?? (serverError?.field === 'bio' ? serverError.text : undefined) }

  // A refused Save shakes once (#20); the flag drops so the next refusal can shake again.
  useEffect(() => {
    if (!stuck) return
    const timer = setTimeout(() => setStuck(false), REFUSAL_MS)
    return () => clearTimeout(timer)
  }, [stuck])

  const save = () => {
    const problem = { name: nameError(edit.name), bio: bioFits(edit.bio) ? undefined : BIO_TOO_LONG }
    if (problem.name || problem.bio) {
      setErrors(problem)
      setStuck(true)
      return
    }
    const patch = crewPatch(crew, edit)
    if (!patch) return onClose()
    onSave(patch)
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={() => {
        setEdit(editOf(crew))
        setErrors({})
      }}
      title="Edit crew"
      detents={['tall']}
      actions={[
        { label: 'Save', kind: 'primary', onPress: save, loading: saving, refused: stuck || !!serverError },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="crew-edit"
    >
      <NameStep
        name={edit.name}
        onName={(name) => {
          setEdit((e) => ({ ...e, name }))
          setErrors((e) => ({ ...e, name: undefined }))
        }}
        nameError={shown.name}
        bio={edit.bio}
        onBio={(bio) => {
          setEdit((e) => ({ ...e, bio }))
          setErrors((e) => ({ ...e, bio: undefined }))
        }}
        bioError={shown.bio}
        choice={edit.choice}
        onChoice={(choice) => setEdit((e) => ({ ...e, choice }))}
        tags={edit.tags}
        onTag={(slug) => setEdit((e) => ({ ...e, tags: toggleTag(e.tags, slug) }))}
        openToSolo={edit.openToSolo}
        onOpenToSolo={(openToSolo) => setEdit((e) => ({ ...e, openToSolo }))}
        previewSeed={crew.emblemSeed}
        intentText={intentLine(edit.choice ? intentOf(edit.choice) : crew.intent) ?? ''}
      />
    </Sheet>
  )
}
