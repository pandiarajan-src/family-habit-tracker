import type { HabitRead, MemberRead } from '../api/types'
import { copy } from '../copy'
import { removalList } from '../lib/parent'
import { ConfirmDialog } from './ConfirmDialog'

interface RemoveMemberDialogProps {
  member: MemberRead
  /** Every habit in the family, archived ones too, to count the member's. */
  habits: HabitRead[]
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * "Remove Kavi from the family?" lists everything that goes for good, and needs a second,
 * explicit tap; focus starts on "Keep Kavi" and Escape keeps them (REQ-007).
 */
export function RemoveMemberDialog({
  member,
  habits,
  busy,
  onConfirm,
  onCancel,
}: RemoveMemberDialogProps) {
  const name = member.nickname
  return (
    <ConfirmDialog
      title={copy.settings.removeTitle(name)}
      confirmLabel={copy.settings.removeYes(name)}
      confirmIcon="trash"
      cancelLabel={copy.settings.removeNo(name)}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <span>{copy.settings.removeLead(name)}</span>
      <ul>
        {removalList(member, habits).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <span>{copy.settings.removeKeeps(name)}</span>
    </ConfirmDialog>
  )
}
