import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useActiveSession, useSession } from '../auth/useSession'
import { copy } from '../copy'
import { AppHeader } from './AppHeader'
import { Button } from './Button'
import { MemberChip } from './MemberChip'
import { Tabs, type TabItem } from './Tabs'

const MEMBER_TABS: TabItem[] = [
  { to: '/my-day', label: copy.tabs.myDay, icon: 'home' },
  { to: '/history', label: copy.tabs.history, icon: 'calendar' },
  { to: '/gems', label: copy.tabs.gems, icon: 'gift' },
  { to: '/habits', label: copy.tabs.habits, icon: 'list', also: ['/my-pin'] },
]
const PARENT_TAB: TabItem = { to: '/parent', label: copy.tabs.parent, icon: 'shield' }

/**
 * The shared header of every signed-in screen: who's checking in, "Done — switch person"
 * (REQ-004) and the tabs. Only parents get the Parent tab (REQ-028).
 */
export function MemberLayout() {
  const { switchPerson } = useSession()
  const member = useActiveSession()?.acting_member
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)

  // RequireMember renders this layout only while someone is checking in.
  if (!member) return null
  const isParent = member.role === 'parent'
  const tabs = isParent ? [...MEMBER_TABS, PARENT_TAB] : MEMBER_TABS

  const onSwitch = async () => {
    setSwitching(true)
    try {
      await switchPerson()
      navigate('/', { replace: true })
    } catch {
      // A 401/403 is handled by the session (Passcode entry or the board); stay put otherwise.
      setSwitching(false)
    }
  }

  return (
    <>
      <AppHeader below={<Tabs label={copy.header.tabs} items={tabs} />}>
        <MemberChip
          emoji={member.avatar_emoji}
          label={member.nickname + (isParent ? copy.header.parentSuffix : '')}
        />
        <Button size="sm" icon="swap" onClick={onSwitch} disabled={switching}>
          {copy.header.switchPerson}
        </Button>
      </AppHeader>
      <Outlet />
    </>
  )
}
