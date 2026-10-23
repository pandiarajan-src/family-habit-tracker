// Short names for the generated OpenAPI types; never hand-write API shapes.
import type { components } from './schema'

type Schemas = components['schemas']

export type SessionRead = Schemas['SessionRead']
export type SessionCreate = Schemas['SessionCreate']
export type SessionUpdate = Schemas['SessionUpdate']
export type MemberRead = Schemas['MemberRead']
export type HabitRead = Schemas['HabitRead']
export type FamilyRead = Schemas['FamilyRead']
export type Role = Schemas['Role']
export type CheckInRead = Schemas['CheckInRead']
export type StreakSaverRead = Schemas['StreakSaverRead']
export type SaveablePeriodRead = Schemas['SaveablePeriodRead']
export type AdjustmentRead = Schemas['AdjustmentRead']
export type AdjustmentKind = Schemas['AdjustmentKind']
