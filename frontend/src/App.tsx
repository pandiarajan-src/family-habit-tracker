import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { RequireFamily } from './auth/RequireFamily'
import { RequireMember } from './auth/RequireMember'
import { RequireParent } from './auth/RequireParent'
import { SessionProvider } from './auth/SessionProvider'
import { MemberLayout } from './components/MemberLayout'
import { FamilyBoard } from './screens/FamilyBoard'
import { GemsPrizes } from './screens/GemsPrizes'
import { HabitEditor } from './screens/HabitEditor'
import { History } from './screens/history/History'
import { MyDay } from './screens/MyDay'
import { MyHabits } from './screens/MyHabits'
import { MyPin } from './screens/MyPin'
import { Approvals } from './screens/parent/Approvals'
import { FamilySettings } from './screens/parent/FamilySettings'
import { ParentTabs } from './screens/parent/ParentTabs'
import { PasscodeEntry } from './screens/PasscodeEntry'
import { PinEntry } from './screens/PinEntry'

/**
 * Every route of the MVP. Later phases replace a screen's body, never this file.
 *   /unlock               Passcode entry (the only page without a session, REQ-001)
 *   /                     Family board (REQ-022)       /pin/:memberId   PIN pad (REQ-003)
 *   /my-day /history /gems /habits[/new|/:habitId] /my-pin   member screens (acting member)
 *   /parent/approvals /parent/settings                        parent screens (REQ-028)
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/unlock" element={<PasscodeEntry />} />
      <Route element={<RequireFamily />}>
        <Route index element={<FamilyBoard />} />
        <Route path="pin/:memberId" element={<PinEntry />} />
        <Route element={<RequireMember />}>
          <Route element={<MemberLayout />}>
            <Route path="my-day" element={<MyDay />} />
            <Route path="history" element={<History />} />
            <Route path="gems" element={<GemsPrizes />} />
            <Route path="habits" element={<MyHabits />} />
            <Route path="habits/new" element={<HabitEditor />} />
            <Route path="habits/:habitId" element={<HabitEditor />} />
            <Route path="my-pin" element={<MyPin />} />
            <Route element={<RequireParent />}>
              <Route path="parent" element={<ParentTabs />}>
                <Route index element={<Navigate to="approvals" replace />} />
                <Route path="approvals" element={<Approvals />} />
                <Route path="settings" element={<FamilySettings />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  )
}

export default App
