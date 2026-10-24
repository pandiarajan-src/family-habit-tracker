import { useMemo } from 'react'
import { copy } from '../copy'
import { timezoneGroups } from '../lib/parent'
import { FieldShell } from './TextField'
import fieldStyles from './TextField.module.css'

interface TimezoneSelectProps {
  id: string
  /** The family's saved timezone, always offered even if this browser doesn't list it. */
  current: string
  value: string
  disabled?: boolean
  onChange: (zone: string) => void
}

/** "Family timezone": the browser's IANA zones, grouped by region (REQ-027). */
export function TimezoneSelect({ id, current, value, disabled, onChange }: TimezoneSelectProps) {
  const groups = useMemo(
    () => timezoneGroups(current, Intl.supportedValuesOf('timeZone')),
    [current],
  )
  return (
    <FieldShell id={id} label={copy.settings.timezone} hint={copy.settings.timezoneHint}>
      <select
        id={id}
        className={fieldStyles.input}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((group) => (
          <optgroup key={group.region} label={group.region}>
            {group.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </FieldShell>
  )
}
