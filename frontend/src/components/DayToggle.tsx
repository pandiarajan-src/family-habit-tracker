import { copy } from '../copy'
import type { DayView } from '../lib/myDay'
import { Segmented, type SegmentedOption } from './Segmented'

const OPTIONS: SegmentedOption<DayView>[] = [
  { id: 'today', label: copy.myDay.today },
  { id: 'yesterday', label: copy.myDay.yesterday },
]

/** "Today / Yesterday" on My day (REQ-013). */
export function DayToggle({
  value,
  onChange,
}: {
  value: DayView
  onChange: (view: DayView) => void
}) {
  return (
    <Segmented label={copy.myDay.whichDay} options={OPTIONS} value={value} onChange={onChange} />
  )
}
