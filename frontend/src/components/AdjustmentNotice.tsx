import { copy } from '../copy'
import type { ChangeNotice } from '../lib/myDay'
import { Button } from './Button'
import { Notice } from './Notice'

/** "Mum updated Reading for Tue 14 Oct" with "Got it" (REQ-015). */
export function AdjustmentNotice({
  notice,
  busy,
  onGotIt,
}: {
  notice: ChangeNotice
  busy: boolean
  onGotIt: () => void
}) {
  return (
    <Notice
      icon="edit"
      title={notice.title}
      actions={
        <Button size="sm" onClick={onGotIt} disabled={busy}>
          {copy.changes.gotIt}{' '}
          <span className="sr-only">{copy.changes.gotItFor(notice.title)}</span>
        </Button>
      }
    >
      {notice.text}
    </Notice>
  )
}
