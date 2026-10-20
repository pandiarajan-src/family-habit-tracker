# Spec: Family habit tracker

Change: `0001-family-habit-tracker` · Intent: [intent.md](intent.md) · Status: Approved · Date: 2026-10-20

## 1. Summary

The family tracks small daily and weekly habits on a paper chart that gets lost, doesn't remember streaks and can't show the week or month at a glance, and the kids have no fun reason to come back to it. We will build a cloud-hosted, login-protected web app, used on shared tablets and laptops, where each family member (two parents, two children) keeps their own daily and weekly habits, checks them off in well under a minute, and sees everyone's habits, streaks and gems on one family view. Habits are gamified: check-ins and streak milestones earn gems, gems can be spent to save a streak after a missed day, and gems are exchanged for parent-defined prizes that parents approve. Parents can also adjust the children's habits and check-ins. Success is the kids opening the app daily without reminders and streaks outlasting the paper chart. The first version serves one family, but every record is scoped to a family so multiple families can be added later.

Terms used below:

- **Family session**: a device signed in with the family passcode [child-data-privacy #3].
- **Acting member**: the family member currently using a signed-in device, chosen on the "Who's checking in?" screen. Writes are attributed to the acting member.
- **Family day / family week**: a calendar day, or a Monday–Sunday week, in the family's timezone [api-conventions #5].
- **Streak saver**: the user-facing name for the intent's "missed-day exemption" (see REQ-020 for why the word "missed" is not used in the UI [family-ux #6]).

## 2. Requirements

### Access and shared devices

### REQ-001: Sign a device in with the family passcode
**User story:** As a family member, I want to unlock the app on a shared tablet or laptop with our family passcode, so that only our family can see our data.
**Acceptance criteria:**
- Given a device with no family session, when any page or data endpoint other than passcode entry is requested, then the page redirects to Passcode entry and the API returns `401` with `{"detail": ...}` [child-data-privacy #3] [api-conventions #4].
- Given the passcode entry screen, when the correct family passcode is entered, then a family session is created and the device shows the Family board. The session ends after 5 minutes without activity (REQ-004).
- Given the passcode entry screen, when a wrong passcode is entered, then the API returns `401`, the screen says "That passcode didn't work — try again", and no session is created.
- Given 10 wrong passcode attempts from one client within 15 minutes, when another attempt is made, then the API returns `429` and the screen asks the person to wait 15 minutes, even if the passcode is correct.
- Given any passcode attempt, when it is logged, then the log line contains no passcode value, correct or incorrect [child-data-privacy #2].

### REQ-002: Sign a device out of the family
**User story:** As a parent, I want to sign a device out of the family completely, so that a device leaving the house no longer shows our data.
**Acceptance criteria:**
- Given a device with a family session and a parent as acting member, when the parent chooses "Sign this device out", then the session is ended and the device shows Passcode entry.
- Given a signed-out session's cookie, when it is replayed against any data endpoint, then the API returns `401`.
- Given a child as acting member, when they look for "Sign this device out", then it is not offered and the API returns `403` if called directly.

### REQ-003: Choose who's checking in (member PIN)
> Concern C1 resolved: option B, a family passcode session plus a per-member PIN stored outside Member.

**User story:** As a family member on a shared device, I want to pick myself and enter my own short PIN, so that nobody else can check off habits or spend gems as me.
**Acceptance criteria:**
- Given a family session with no acting member, when a person taps their avatar on the Family board and enters their correct 4-digit PIN, then they become the acting member and see My day.
- Given a wrong PIN, when it is entered, then the API returns `401` with `WWW-Authenticate: MemberPIN`, the PIN pad clears, and the screen says "Not quite — have another go" (C18).
- Given 5 consecutive wrong PINs for one member, when a sixth is tried within 5 minutes, then the API returns `429` and the PIN pad tells the person to ask a parent or wait 5 minutes. The lockout affects only that member.
- Given a family session with no acting member, when any write endpoint is called, then the API returns `403`. Read endpoints (family view) still work [child-data-privacy #3].
- Given any PIN attempt, when it is logged, then the log line contains the member ID only: no nickname and no PIN [child-data-privacy #2].

### REQ-004: Hand the device over and time out when idle
**User story:** As a family member sharing a tablet, I want the app to sign me out when I'm done or have stopped using it, so that the next person can't act as me and an unattended device doesn't stay signed in.
**Acceptance criteria:**
- Given an acting member, when they tap "Done — switch person", then the acting member is cleared and the Family board is shown.
- Given an acting member and no user interaction for 5 minutes, when the timeout passes, then the acting member is cleared on the server. Because the family session idles out at the same moment (next criterion), the next request, read or write, returns `401` and the device shows Passcode entry. While the family session is still active and nobody is acting (for example after "Done — switch person"), a write returns `403` (REQ-003, REQ-028) (C17).
- Given a family session and no user interaction for 5 minutes, when the timeout passes, then the family session ends on the server, the next data request returns `401`, and the device shows Passcode entry with "You were signed out to keep things safe. Unlock to carry on!" [family-ux #6]. A device never stays signed in for more than 5 inactive minutes.
- Given a screen that refreshes in the background (REQ-012), when it fetches data, then that fetch does not count as activity and does not extend either timeout. Only requests triggered by a person (a tap, a click, a key press, navigation) count.
- Given two devices in the same family, when different members are acting on each at the same time, then each device's writes are attributed to its own acting member.

### REQ-005: Set and reset a member PIN
> Concern C1 resolved: option B.

**User story:** As a family member, I want to set my own PIN, and as a parent I want to reset a child's PIN when they forget it, so that nobody gets locked out for good.
**Acceptance criteria:**
- Given an acting member, when they set a new PIN of exactly 4 digits for themselves and give their correct current PIN, then the API returns `204` and the new PIN is required at the next unlock (C14).
- Given an acting member changing their own PIN, when the current PIN is missing, then the API returns `422`; when it is wrong, then the API returns `401`, the attempt counts toward the 5-try PIN lockout (REQ-003), and once locked the API returns `429`.
- Given the My PIN screen, when the new PIN and "Type the new PIN again" don't match, then the screen says "Those two PINs don't match yet — try typing the new one again" and nothing is sent. The confirmation is checked only in the browser [family-ux #6].
- Given a parent as acting member, when they reset a child's PIN, then no current PIN is needed, the API returns `204`, the child's lockout is cleared, and an adjustment is recorded for that child (REQ-015).
- Given a child as acting member, when they try to set another member's PIN, then the API returns `403`.
- Given a PIN that isn't exactly 4 digits, when it is submitted, then the API returns `422`.

### REQ-006: Manage family members
**User story:** As a parent, I want to add family members and edit their nickname, avatar and role, so that everyone in our family has a profile.
**Acceptance criteria:**
- Given a parent as acting member, when they add a member with a nickname (1–20 characters, unique within the family), one avatar emoji and a role of `parent` or `child`, then the API returns `201` with the member [child-data-privacy #1] [api-conventions #3].
- Given a member payload with any extra field (for example email, birthdate, age, photo or location), when it is submitted, then the API returns `422` and nothing is stored [child-data-privacy #1].
- Given a duplicate nickname within the family, when it is submitted, then the API returns `422`.
- Given any acting member, when they edit their own nickname or avatar, then the change is saved. Only a parent can change a member's role, and the API returns `403` to a child who tries.
- Given an attempt to demote the last remaining parent, when it is submitted, then the API returns `422` with a detail explaining that a family needs at least one parent.

### REQ-007: Remove a member and all of their data
**User story:** As a parent, I want removing a member to delete everything about them, so that no data about them is left behind.
**Acceptance criteria:**
- Given a parent as acting member, when they remove a member and confirm, then the API returns `204` and that member's habits, check-ins, streak savers, gem transactions, prize claims, PIN credential and the adjustments recorded about them are all deleted by database-level cascade [child-data-privacy #4] [api-conventions #3].
- Given the removed member, when their former check-ins are queried through the API or directly in the database, then none remain [child-data-privacy #4].
- Given records where the removed member was only the actor (for example a parent who approved a claim or corrected a check-in), when the member is removed, then those records stay, with the actor shown as "a family member".
- Given a non-existent member ID, when removal is requested, then the API returns `404`.
- Given the last remaining parent, when their removal is requested, then the API returns `422` with a detail explaining that a family needs at least one parent, and nothing is deleted.

### Habits

### REQ-008: Create my own habits
**User story:** As a family member (kid or parent), I want to create my own daily and weekly habits with a goal, so that the app tracks what I actually want to do.
**Acceptance criteria:**
- Given an acting member, when they create a habit with a title (1–40 characters), an optional goal note (up to 60 characters, e.g. "40 minutes", "3 litres") and a frequency of `daily`, then the API returns `201` and the habit appears on their My day from today.
- Given a frequency of `weekly`, when the habit is created with a target of 1–7 check-ins per week, then the API returns `201`. A weekly habit without a target, or with a target outside 1–7, returns `422`.
- Given a member with 20 active habits, when they create another, then the API returns `422` saying the limit is 20. (Limit approved in C7: it keeps the check-in screen short.)
- Given a child as acting member, when they create a habit for another member, then the API returns `403`.

### REQ-009: Edit, archive or delete my habits
**User story:** As a family member, I want to change, pause or remove my habits, so that my list stays relevant.
**Acceptance criteria:**
- Given my habit, when I change its title or goal note, then past check-ins, streaks and gems are unchanged.
- Given my weekly habit, when I change its target, then the new target applies from the current family week onward and past weeks keep the target they had.
- Given my habit, when I archive it, then it leaves My day, its history stays visible in the week and month views, and its streak is frozen. Unarchiving starts it again from today.
- Given my habit, when I delete it and confirm, then the API returns `204` and its check-ins and streak savers are deleted. Gems already spent stay spent, and earned gems are recalculated (REQ-018).
- Given a habit ID that doesn't exist, when it is edited or deleted, then the API returns `404`.

### REQ-010: Parents manage a child's habits
**User story:** As a parent, I want to add, edit, archive or delete my children's habits and goals, so that I can help them set sensible goals.
**Acceptance criteria:**
- Given a parent as acting member, when they create, edit, archive or delete a child's habit, then it succeeds as in REQ-008/REQ-009 and an adjustment is recorded for the child (REQ-015).
- Given a parent as acting member, when they try to change the other parent's habits, then the API returns `403`, because the intent only gives parents authority over the kids' habits (approved in C7).
- Given a child as acting member, when they try to change anyone else's habit, then the API returns `403`.

### Check-ins

### REQ-011: Check off a habit for today
**User story:** As a family member, I want to check off a habit with one tap, so that checking in takes seconds, not minutes.
**Acceptance criteria:**
- Given an acting member on My day, when they tap "Check off <habit title>", then the check-in is saved for today, the button changes to "Done" with the updated streak and gem count, and it took no more than 2 taps from My day [family-ux #3].
- Given a checked-off habit, when the member taps "Undo <habit title>" on the same day, then the check-in is removed and the gems and streak go back to what they were.
- Given a keyboard-only user, when they Tab to a habit and press Enter or Space, then the habit is checked off and the focus ring stays visible [family-ux #1].
- Given a device on Passcode entry (the usual state, because sessions end after 5 idle minutes, REQ-004), when a member enters the family passcode, picks their avatar, enters their PIN and checks off one habit, then the whole flow takes under 60 seconds (measured in E2E as: passcode + "Unlock", 1 tap on the avatar, 4 PIN digits, 1 tap to check off).
- Given a weekly habit, when it is checked off today, then today counts once toward this week's target. A second check-in on the same day is not a separate one (REQ-012).

### REQ-012: Simultaneous and repeated check-ins are safe
**User story:** As a family, we want to check in at the same time on different devices, or one after another on the same device, so that nobody's check-in is lost or doubled.
**Acceptance criteria:**
- Given two devices, when different members check off their habits at the same moment, then both check-ins are saved and attributed correctly.
- Given the same habit and day, when a check-in is submitted twice (double tap, or two devices), then exactly one check-in exists: the first request returns `201` and later ones return `200` with the same check-in.
- Given an undo and a check-in racing for the same habit and day, when both finish, then the final state is whichever request the server handled last, and the gem balance matches that state.
- Given a device showing the Family board, when another device saves a check-in, then the board shows it within 30 seconds, or right away when the screen regains focus. Background refreshes don't extend the session (REQ-004).

### REQ-013: Check in for yesterday
> Note: the one-day window (approved in C7) covers the intent's "forgot yesterday" case without letting old gaps be filled for gems; see section 8, Q6.

**User story:** As a family member, I want to check off a habit I did yesterday but forgot to record, so that one forgetful evening doesn't break my streak.
**Acceptance criteria:**
- Given an acting member, when they switch My day to "Yesterday" and check off a habit, then the check-in is saved for yesterday's family date and streaks and gems are recalculated.
- Given a member (child or parent acting for themselves), when they try to check in for a date before yesterday, then the API returns `422` with a detail saying only today and yesterday can be checked in.
- Given any member, when they try to check in for a future date, or a date before the habit was created, then the API returns `422`.

### REQ-014: Parents correct a child's check-ins
**User story:** As a parent, I want to add or remove a check-in on any past day for my child, so that I can fix mistakes.
**Acceptance criteria:**
- Given a parent as acting member, when they add or remove a check-in for a child's habit on any date from the habit's creation date to today, then it succeeds, streaks and gems are recalculated, and an adjustment is recorded for the child (REQ-015).
- Given a parent, when they try to correct the other parent's check-ins outside the normal today/yesterday window, then the API returns `403`.
- Given a correction that lowers a child's earned gems below what they've already spent, when it is saved, then the available balance is set to 0, never negative: the shortfall is written off with a `correction_writeoff` gem transaction. The next gem the child earns takes the balance to 1 straight away, so they can start again immediately (C6, resolved).
- Given a shortfall that was written off, when a parent later adds back the removed check-ins, then the child gets those gems back and the write-off is not reversed (C6, resolved).

### REQ-015: Children can see what a parent changed
**User story:** As a kid, I want to see when a parent changed my habits or check-ins, so that changes never feel sneaky.
**Acceptance criteria:**
- Given a parent changed a child's habit, check-in or PIN, when the child next opens My day, then a notice shows "Mum updated Reading for Tue 14 Oct" (actor's nickname, what changed, date) with a "Got it" button that dismisses it.
- Given any member, when they open "Changes to my habits", then they see the last 12 months of adjustments made to their data, newest first.
- Given a parent's own data, when the other parent views their changes list, then it's empty, because parents can't adjust each other's habits (REQ-010).
- Given an adjustment, when it is stored or logged, then it holds member and habit IDs, not nicknames or habit titles [child-data-privacy #2].

### Streaks and gems

### REQ-016: Daily habit streaks
**User story:** As a family member, I want to see how many days in a row I've kept each daily habit, so that I'm motivated not to break the chain.
**Acceptance criteria:**
- Given a daily habit, when the streak is calculated, then it equals the number of checked-in family days in the current unbroken run ending today or yesterday. A day covered by a streak saver keeps the run unbroken but doesn't add to the count.
- Given today not yet checked in, when the streak is shown before the family day ends, then yesterday's streak is still shown as alive ("Check in today to make it 4!").
- Given a day before yesterday with neither a check-in nor a streak saver, when the streak is calculated, then the run before that day has ended and the current streak starts after it.
- Given any habit, when streaks are shown, then both the current streak and the best-ever streak are shown.

### REQ-017: Weekly habit goals and streaks
**User story:** As a family member, I want weekly habits (like "piano 3 times a week") to count when I hit my weekly target, so that habits that aren't daily still build streaks.
**Acceptance criteria:**
- Given a weekly habit with target N, when a family week (Monday–Sunday) has at least N check-in days, then that week is complete.
- Given a weekly habit, when its streak is calculated, then it equals the number of complete weeks in the current unbroken run, where the current week counts once it is complete and doesn't break the run while it is still in progress.
- Given a week that ended below target and has no streak saver, when the streak is calculated, then the run has ended.
- Given a weekly habit checked in at 23:30 on a Sunday in the family's timezone, when weeks are calculated, then the check-in counts toward the week that began the previous Monday, and a check-in at 00:00 the next Monday counts toward the new week. Weeks start on Monday (ISO-8601) in the family's timezone (approved in C7) [api-conventions #5].

### REQ-018: Gems for daily habits
**User story:** As a family member, I want to earn gems for each daily check-in and bonus gems for streak milestones, so that keeping a streak feels rewarding.
**Acceptance criteria:**
- Given a daily habit, when it is checked in for a day, then the member earns 1 gem for that habit that day: gems are per day *per habit*, so 3 habits done today earn 3 gems (C2, resolved).
- Given a daily streak whose count reaches 5, when the gems are calculated, then the member earns a 5-gem bonus. When the count reaches 7, they earn a further 7-gem bonus, so a 7-day streak has earned 7 + 5 + 7 = 19 gems.
- Given a streak that continues past 7 days, when gems are calculated, then the bonuses repeat every 7 streak days: +5 on days 12, 19, 26, … and +7 on days 14, 21, 28, … (day *n* earns +5 when *n* mod 7 = 5 and +7 when *n* mod 7 = 0). This is the 7-day cycle (C2, resolved).
- Given a check-in that is added or removed later (undo, yesterday, parent correction), when gems are recalculated, then earned gems always equal the rules above applied to the current check-ins and streak savers. Spent gems are never recalculated.

### REQ-019: Gems for weekly habits
**User story:** As a family member, I want gems for meeting weekly goals and a bonus for long weekly streaks, so that weekly habits are as rewarding as daily ones.
**Acceptance criteria:**
- Given a weekly habit, when a family week becomes complete, then the member earns 1 gem for that habit that week.
- Given a weekly streak whose count reaches 5, 10, 15, … weeks, when the gems are calculated, then the member earns a 5-gem bonus each time. There is no 7-week bonus.
- Given a week that drops below target after a correction or undo, when gems are recalculated, then that week's gem and any bonus that depended on it are removed.

### REQ-020: Streak saver (missed-day exemption)
> Rules approved for this version (C3, resolved); see section 8, Q3.

**User story:** As a family member, I want to spend gems to save my streak after a day I couldn't do a habit, so that one bad day doesn't wipe out weeks of effort.
**Acceptance criteria:**
- Given a daily habit with a past day that has no check-in, is within the last 7 family days, is not today, and directly follows a checked-in or saved day, when the member chooses "Use a streak saver", then the gems are deducted, the day shows as "Saved", and the streak continues.
- Given today, a day more than 7 family days ago, or a day that doesn't directly follow a checked-in or saved day, when a streak saver is requested for it, then the API returns `422` and no gems are spent.
- Given a streak, when savers are used within the same unbroken run, then the 1st costs 1 gem, the 2nd 2 gems, the 3rd 3 gems, and so on (two saved days cost 3 gems in total). The cost goes back to 1 when a run ends and a new one starts.
- Given the member's available gems are fewer than the cost, when they try to use a saver, then the API returns `409` and the screen says "You need 3 gems for this saver — keep going and you'll get there!". The streak is not saved and the balance doesn't change.
- Given a weekly habit, when the most recent past week ended below target, then a streak saver can be used for that week with the same rising cost.
- Given a saved day, when anyone tries to check it in afterwards, then the API returns `409`. A saved day earns no daily gem.
- Given a parent as acting member, when they use a streak saver for their child, then the child's gems are spent and an adjustment is recorded (REQ-015).
- Given any screen, when a day without a check-in is shown, then the copy is encouraging ("Let's try tomorrow!", "Save your streak?"), never "missed" or "failed" [family-ux #6].

### REQ-021: Gem balance and history
**User story:** As a family member, I want to see my gem balance and how I earned and spent gems, so that I understand my progress toward a prize.
**Acceptance criteria:**
- Given a member, when they open Gems & prizes, then they see their available balance (earned − spent − held for pending claims + write-offs, never below 0, REQ-014) and a list of earning and spending events, newest first, covering at least the last 12 months.
- Given a pending prize claim, when the balance is shown, then the held gems are shown separately ("40 gems waiting for approval").
- Given any member, when they view another member's balance on the Family board, then they see the balance total but not the event history, because the intent's family view covers gems, not the detailed ledger (approved in C7).

### Family view

### REQ-022: Family board
**User story:** As a family, we want to see everyone's habits, today's progress, streaks and gems on one screen, so that we cheer each other on.
**Acceptance criteria:**
- Given a family session (with or without an acting member), when the Family board is shown, then each member appears with their avatar, nickname, today's habits done out of due, longest current streak and gem balance.
- Given the board, when a member's card is opened, then their habits are listed with today's status, current streak and best streak, read-only unless the viewer is allowed to edit them.
- Given a 360px-wide screen, when the board is shown, then member cards stack in one column with no horizontal scrolling [family-ux #1].

### REQ-023: Week and month at a glance, kept for a year
**User story:** As a family, we want to see the week and the month for everyone, and look back over the past year, so that we can spot patterns and celebrate progress.
**Acceptance criteria:**
- Given the History view, when "Week" is selected, then each member's daily habits are shown against Monday–Sunday with each day marked "Done", "Saved" or "Not yet".
- Given a weekly habit in the week view, when it is shown, then its days are marked only "Done" or "Not yet" (never "Saved"), and the row has one week-level state: "Week complete" (check-ins ≥ target, shown as e.g. "3 of 3"), "Week saved" (a weekly streak saver covers it), or, for the current week, "In progress — 2 of 3". Check-ins above the target show as "Week complete" rather than counts like "5 of 3" (C13).
- Given any day view, when today is shown, then it is never marked "Saved", because savers apply only to past days (REQ-020, C13).
- Given a 360px-wide screen, when the week view is shown, then no column or label is clipped and nothing scrolls sideways, not even inside a card: each habit is a row with its name and week state on top and 7 compact day chips (M T W T F S S, each with a text-labelled state) below it, wrapping if needed [family-ux #1] (C12).
- Given "Month", when a month is selected, then each habit shows a calendar of the month with the same day states, and a completion count per member.
- Given any date from the last 12 months, when someone navigates back to it, then its data is shown. Data is retained for at least 13 months; there is no automatic purge in this version.
- Given a request for more than 62 days at once, when the API is called, then it returns `422`.
- Given day states, when they are shown, then each state uses a text label or icon and label, not colour alone, and meets contrast requirements [family-ux #4] [family-ux #5].

### Prizes

### REQ-024: Parents manage prizes
**User story:** As a parent, I want to create prizes with a gem price, so that the kids have something to work toward that we're happy to give.
**Acceptance criteria:**
- Given a parent as acting member, when they create a prize with a title (1–40 characters) and a gem cost (whole number, 1–10,000), then the API returns `201` and it appears in everyone's prize list.
- Given a parent, when they edit a prize's cost, then pending claims keep the cost they were made at.
- Given a parent, when they delete a prize with no pending claims, then the API returns `204` and past claims keep the prize's title and cost. If a claim is pending, the API returns `409`.
- Given a child as acting member, when they try to create, edit or delete a prize, then the API returns `403`.

### REQ-025: Claim a prize
**User story:** As a family member, I want to claim a prize when I have enough gems, so that my effort turns into something real.
**Acceptance criteria:**
- Given an available balance at or above a prize's cost, when the member taps "Claim <prize title>", then a pending claim is created (`201`), the cost is held from their balance, and parents see it awaiting approval.
- Given a balance below the cost, when they try to claim, then the API returns `409` and the screen shows "12 more gems to go!" instead of an enabled claim button.
- Given a pending claim, when the claimant cancels it, then the claim is cancelled and the held gems are returned.

### REQ-026: Parents approve or decline prize claims
**User story:** As a parent, I want to approve or decline each prize claim, so that prizes are given when it suits the family.
**Acceptance criteria:**
- Given a parent as acting member and a pending claim by someone else, when they approve it, then the claim is approved, the held gems are spent, and the claimant sees "Your prize is approved!".
- Given a pending claim, when a parent declines it, then the held gems go back to the claimant and they see "Not this time — your gems are back." [family-ux #6]
- Given a parent's own claim in a family with two or more parents, when the same parent tries to approve or decline it, then the API returns `403`. Another parent must decide it (C5, resolved).
- Given a family with exactly one parent, when that parent approves or declines their own claim, then it succeeds (C5, resolved).
- Given a claim that isn't pending, when someone tries to approve or decline it, then the API returns `409`.

### Platform

### REQ-027: Family timezone defines days and weeks
**User story:** As a parent, I want the app to use our home timezone, so that "today" and streaks match our day wherever the server is.
**Acceptance criteria:**
- Given the family timezone (IANA name, e.g. `Europe/London`), when a check-in is saved at 23:59 local time, then it counts for that local date, even if the server's UTC date is different.
- Given any date or datetime in an API request or response, when it is exchanged, then it is ISO-8601, and datetimes carry the family's timezone offset [api-conventions #5].
- Given a parent, when they change the family timezone, then future check-ins use the new timezone and existing check-in dates stay as they are.
- Given an invalid timezone name, when it is submitted, then the API returns `422`.

### REQ-028: Role-based access control
**User story:** As a parent, I want the app to enforce who can change what, so that kids can't edit others' data or approve prizes.
**Acceptance criteria:**
- Given every data endpoint, when it is called without a family session, then it returns `401` [child-data-privacy #3].
- Given every write endpoint, when it is called without an acting member, then it returns `403`.
- Given the permission matrix (members change their own data; parents also change the children's habits, check-ins, PINs and streak savers, plus members, prizes, claims and family settings; nobody changes another parent's habits), when any write is attempted outside it, then the API returns `403` and nothing changes.
- Given a resource ID belonging to a different family, when it is requested, then the API returns `404`, so that a future multi-family version cannot leak data between families.

## 3. Data model

Every family-owned entity carries `family_id`, so that more families can be added later without migrating data (intent constraint). All IDs are UUIDs. Timestamps are stored in UTC and shown in the family timezone [api-conventions #5]. Free text fields (nickname, habit title, goal note, prize title) are never logged [child-data-privacy #2].

**Family**
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| timezone | string | IANA zone name, required |
| passcode_hash | string | slow salted hash (e.g. argon2/bcrypt); passcode ≥ 6 characters; never returned by the API |
| created_at | datetime | |

**Member** — only the fields allowed by [child-data-privacy #1]: no email, birthdate, age, photo or location for anyone.
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| family_id | UUID | FK → Family, cascade delete |
| nickname | string | 1–20 chars, unique within family |
| avatar_emoji | string | exactly one emoji grapheme |
| role | enum | `parent` \| `child` |
| created_at | datetime | |

**MemberCredential** (C1, option B). A hashed PIN in a separate record linked to the member, never on Member and never returned by the API, as the amended [child-data-privacy #1] allows.
| Field | Type | Constraints |
|---|---|---|
| member_id | UUID | PK, FK → Member, cascade delete [child-data-privacy #4] |
| pin_hash | string | hash of 4-digit PIN; never returned or logged [child-data-privacy #2] |
| failed_attempts | int | ≥ 0 |
| locked_until | datetime? | |

**Session** (server-side; the browser holds only an opaque, HttpOnly, Secure, SameSite=Lax cookie)
| Field | Type | Constraints |
|---|---|---|
| id | string | random ≥ 128 bits |
| family_id | UUID | FK → Family, cascade delete |
| acting_member_id | UUID? | FK → Member, set null on delete |
| last_activity_at | datetime | updated only by person-initiated requests, not background refreshes (REQ-004) |
| acting_member_last_activity_at | datetime? | acting member cleared after 5 min inactivity |
| expires_at | datetime | last_activity_at + 5 min; the session is deleted once this passes |

**Habit**
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| family_id | UUID | FK → Family |
| member_id | UUID | FK → Member, cascade delete [child-data-privacy #4] |
| title | string | 1–40 chars |
| goal_note | string? | ≤ 60 chars |
| frequency | enum | `daily` \| `weekly` |
| created_on | date | family date; check-ins not allowed before it |
| archived_at | datetime? | |

**WeeklyTarget** (keeps past weeks' targets when a target changes, REQ-009)
| Field | Type | Constraints |
|---|---|---|
| habit_id | UUID | FK → Habit, cascade delete |
| effective_from_week | date | Monday; unique with habit_id |
| target | int | 1–7 |

**CheckIn**
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| habit_id | UUID | FK → Habit, cascade delete |
| member_id | UUID | FK → Member, cascade delete [child-data-privacy #4] (denormalised so the cascade is direct) |
| date | date | family date; **unique (habit_id, date)** (REQ-012) |
| created_by_member_id | UUID? | FK → Member, set null on delete |
| created_at | datetime | |

**StreakSaver** (the exemption)
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| habit_id | UUID | FK → Habit, cascade delete |
| member_id | UUID | FK → Member, cascade delete |
| period_start | date | the saved day, or the Monday of the saved week; unique (habit_id, period_start); must not have a CheckIn on it |
| cost | int | ≥ 1, the cost at the time of saving |
| created_by_member_id | UUID? | FK → Member, set null |
| created_at | datetime | |

**GemTransaction** (spending only; earned gems are derived from CheckIns and StreakSavers by the rules in REQ-018/019 so that corrections recalculate them)
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| member_id | UUID | FK → Member, cascade delete |
| kind | enum | `streak_saver` \| `prize_hold` \| `prize_release` \| `correction_writeoff` |
| amount | int | negative for spend/hold, positive for release and write-off (a write-off brings the available balance back to exactly 0, REQ-014) |
| streak_saver_id / prize_claim_id | UUID? | FK, cascade delete with their parent |
| created_at | datetime | |

**Prize**
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| family_id | UUID | FK → Family |
| title | string | 1–40 chars |
| gem_cost | int | 1–10,000 |
| created_at | datetime | |

**PrizeClaim**
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| prize_id | UUID? | FK → Prize, set null on delete |
| prize_title, gem_cost | string, int | copied when the claim is made |
| member_id | UUID | FK → Member, cascade delete |
| status | enum | `pending` \| `approved` \| `declined` \| `cancelled` |
| requested_at, decided_at | datetime, datetime? | |
| decided_by_member_id | UUID? | FK → Member, set null |

**Adjustment** (REQ-015)
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| family_id | UUID | FK → Family |
| target_member_id | UUID | FK → Member, cascade delete [child-data-privacy #4] |
| actor_member_id | UUID? | FK → Member, set null |
| kind | enum | `habit_created` \| `habit_updated` \| `habit_archived` \| `habit_deleted` \| `check_in_added` \| `check_in_removed` \| `streak_saver_used` \| `pin_reset` |
| habit_id | UUID? | set null on habit delete |
| date | date? | the affected day |
| acknowledged_at | datetime? | set when the child taps "Got it" |
| created_at | datetime | |

**Relationships and cascades:** Family 1–* Member, Habit, Prize, Session. Member 1–* Habit, CheckIn, StreakSaver, GemTransaction, PrizeClaim, Adjustment(target). Habit 1–* CheckIn, StreakSaver, WeeklyTarget. Deleting a Member cascades at database level to all rows it owns (listed above), including every CheckIn [child-data-privacy #4]. Columns that only record who acted are set to null.

## 4. API contract

All routes are under `/api/v1` with plural resource nouns [api-conventions #1]. Requests and responses use `XCreate`/`XRead`/`XUpdate` Pydantic schemas with `response_model` declared on every route; no ORM objects or raw dicts [api-conventions #2]. Status codes follow [api-conventions #3] and are declared on each route; all errors are `{"detail": ...}` [api-conventions #4]; dates are ISO-8601 in the family timezone [api-conventions #5]. OpenAPI summaries, schemas and status codes must match behaviour [api-conventions #7].

**Auth column:** *none* = exempt (passcode entry only [child-data-privacy #3]); *family* = family session required, else `401`; *member* = family session + acting member, else `403`; *parent* = acting member must be a parent. "Self/parent-of-child" means the acting member owns the resource or is a parent and the owner is a child. Every route except `POST /sessions` can return `401`; every route with an ID can return `404` (also for another family's IDs, REQ-028).

**Which `401`:** every `401` carries a `WWW-Authenticate` challenge so the client knows what to ask for (C18). `FamilyPasscode`: no session, it ended, or the passcode was wrong; the client shows Passcode entry. `MemberPIN`: the session is fine but a PIN was wrong (`PATCH /sessions/current`, and a wrong `current_pin` on `PUT /members/{member_id}/credentials`); the client stays on the PIN pad or My PIN. The status code alone can't tell these apart, because `PATCH /sessions/current` returns both.

| Method | Path | Request | Response | Status codes | Auth · REQs |
|---|---|---|---|---|---|
| POST | /api/v1/sessions | SessionCreate {passcode} | SessionRead {family_id, acting_member: MemberRead?, expires_at}; sets cookie | 201, 401, 422, 429 | none · REQ-001 |
| GET | /api/v1/sessions/current | — | SessionRead | 200, 401 | family · REQ-001, 003, 004 |
| PATCH | /api/v1/sessions/current | SessionUpdate {acting_member_id: UUID\|null, pin?} | SessionRead | 200, 401 (`FamilyPasscode` or `MemberPIN`), 403 (CSRF), 404, 422, 429 | family · REQ-003, 004 |
| DELETE | /api/v1/sessions/current | — | empty | 204, 401, 403 | parent · REQ-002 |
| GET | /api/v1/families/current | — | FamilyRead {id, timezone} | 200, 401 | family · REQ-027 |
| PATCH | /api/v1/families/current | FamilyUpdate {timezone} | FamilyRead | 200, 401, 403, 422 | parent · REQ-027 |
| GET | /api/v1/members | — | list[MemberRead {id, nickname, avatar_emoji, role, gem_balance, gems_held}] | 200, 401 | family · REQ-006, 021, 022 |
| POST | /api/v1/members | MemberCreate {nickname, avatar_emoji, role, pin} (extra fields → 422) | MemberRead | 201, 401, 403, 422 | parent · REQ-006 |
| GET | /api/v1/members/{member_id} | — | MemberRead | 200, 401, 404 | family · REQ-022 |
| PATCH | /api/v1/members/{member_id} | MemberUpdate {nickname?, avatar_emoji?, role?} | MemberRead | 200, 401, 403, 404, 422 | self (role: parent) · REQ-006 |
| DELETE | /api/v1/members/{member_id} | — | empty | 204, 401, 403, 404, 422 | parent · REQ-007 |
| PUT | /api/v1/members/{member_id}/credentials | MemberCredentialUpdate {pin, current_pin? (required for your own PIN)} | empty | 204, 401 (wrong current PIN), 403, 404, 422, 429 | self/parent-of-child · REQ-005 |
| GET | /api/v1/members/{member_id}/gem-transactions | ?from&to | list[GemTransactionRead {kind, amount, date, habit_id?, prize_claim_id?}] (earned events included, derived) | 200, 401, 403, 404, 422 | self/parent · REQ-021 |
| GET | /api/v1/habits | ?member_id&include_archived | list[HabitRead {id, member_id, title, goal_note, frequency, weekly_target, archived, current_streak, best_streak, today_done, week_progress, next_saver_cost, saveable_periods[]}] | 200, 401, 422 | family · REQ-016, 017, 020, 022 |
| POST | /api/v1/habits | HabitCreate {member_id, title, goal_note?, frequency, weekly_target?} | HabitRead | 201, 401, 403, 422 | self/parent-of-child · REQ-008, 010 |
| GET | /api/v1/habits/{habit_id} | — | HabitRead | 200, 401, 404 | family · REQ-016, 017 |
| PATCH | /api/v1/habits/{habit_id} | HabitUpdate {title?, goal_note?, weekly_target?, archived?} | HabitRead | 200, 401, 403, 404, 422 | self/parent-of-child · REQ-009, 010 |
| DELETE | /api/v1/habits/{habit_id} | — | empty | 204, 401, 403, 404 | self/parent-of-child · REQ-009, 010 |
| PUT | /api/v1/habits/{habit_id}/check-ins/{date} | CheckInCreate {} | CheckInRead {id, habit_id, member_id, date, created_by_member_id, created_at} | 201 new, 200 already existed, 401, 403, 404, 409 (saved day), 422 (date outside window) | self (today/yesterday) / parent-of-child (any date) · REQ-011, 012, 013, 014 |
| DELETE | /api/v1/habits/{habit_id}/check-ins/{date} | — | empty | 204, 401, 403, 404, 422 | same as PUT · REQ-011, 014 |
| GET | /api/v1/check-ins | ?from&to (≤ 62 days)&member_id? | list[CheckInRead] | 200, 401, 422 | family · REQ-023 |
| POST | /api/v1/habits/{habit_id}/streak-savers | StreakSaverCreate {period_start} | StreakSaverRead {id, habit_id, period_start, cost, created_at} | 201, 401, 403, 404, 409 (not enough gems / already checked in), 422 (not saveable) | self/parent-of-child · REQ-020 |
| GET | /api/v1/streak-savers | ?from&to (≤ 62 days)&member_id? | list[StreakSaverRead] | 200, 401, 422 | family · REQ-023 |
| GET | /api/v1/prizes | — | list[PrizeRead {id, title, gem_cost}] | 200, 401 | family · REQ-024, 025 |
| POST | /api/v1/prizes | PrizeCreate {title, gem_cost} | PrizeRead | 201, 401, 403, 422 | parent · REQ-024 |
| PATCH | /api/v1/prizes/{prize_id} | PrizeUpdate {title?, gem_cost?} | PrizeRead | 200, 401, 403, 404, 422 | parent · REQ-024 |
| DELETE | /api/v1/prizes/{prize_id} | — | empty | 204, 401, 403, 404, 409 | parent · REQ-024 |
| GET | /api/v1/prize-claims | ?status&member_id | list[PrizeClaimRead {id, prize_id?, prize_title, gem_cost, member_id, status, requested_at, decided_at?, decided_by_member_id?}] | 200, 401, 422 | family · REQ-025, 026 |
| POST | /api/v1/prize-claims | PrizeClaimCreate {prize_id} | PrizeClaimRead | 201, 401, 403, 404, 409 | member (claims for self) · REQ-025 |
| PATCH | /api/v1/prize-claims/{claim_id} | PrizeClaimUpdate {status: approved\|declined\|cancelled} | PrizeClaimRead | 200, 401, 403, 404, 409, 422 | parent (approve/decline; own claim only when the family has one parent); claimant (cancel) · REQ-025, 026 |
| GET | /api/v1/adjustments | ?member_id | list[AdjustmentRead {id, kind, actor_member_id?, target_member_id, habit_id?, date?, acknowledged_at?, created_at}] | 200, 401, 403, 422 | self/parent · REQ-015 |
| PATCH | /api/v1/adjustments/{adjustment_id} | AdjustmentUpdate {acknowledged: true} | AdjustmentRead | 200, 401, 403, 404 | target member · REQ-015 |

Family creation (passcode, timezone, first parent) is done by a server-side setup command at deploy time, not an HTTP endpoint, so the only unauthenticated endpoint stays passcode entry [child-data-privacy #3] (approved in C7).

Background refresh requests send an `X-Background-Refresh: 1` header (or an equivalent marker chosen in the plan), and the server does not count them as activity (REQ-004).

## 5. UI screens

All screens: single column at 360px, fluid layout to 1440px, no horizontal scroll, nothing hover-only, all actions work by touch, mouse and keyboard with a visible focus ring [family-ux #1]; every control is at least 44×44px [family-ux #2]; every icon (avatar, gem, flame, check) has a visible text label [family-ux #4]; WCAG 2.2 AA contrast [family-ux #5]; encouraging copy with no "failed", "missed" or "bad" [family-ux #6]; every interactive element has an accessible name, e.g. `button "Check off Reading"`, `button "Use a streak saver for Reading on Tue 14 Oct"` [family-ux #7]. Fonts and icons are bundled with the app, not loaded from external hosts [child-data-privacy #5].

1. **Passcode entry** — family passcode field (labelled "Family passcode"), "Unlock" button, friendly error and wait messages, and a "signed out to keep things safe" note after an idle timeout. Only screen without a session. *REQ-001, 004.*
2. **Family board / Who's checking in?** (the device home) — a card per member: avatar + nickname, "3 of 5 done today", longest streak, gem balance; tapping a card opens the PIN pad ("Enter Mia's PIN"; digit buttons 0–9 labelled, "Back" text button). Read-only member details for anyone. Refreshes every 30 s and on focus, without extending the session. *REQ-003, 004, 012, 022.*
3. **My day** (the acting member's home) — today's habits, each with one "Check off <title>" button (becomes "Done ✓ — Undo"), streak ("🔥 4 days") and goal note; weekly habits show "2 of 3 this week"; "Today / Yesterday" toggle; streak-saver prompt for saveable days with cost ("Save your streak for 2 gems?"); notice of parent changes with "Got it"; buttons "Gems & prizes", "History", "My habits", "Done — switch person". Check-off is 1 tap from here [family-ux #3]. *REQ-004, 011, 013, 015, 016, 017, 018, 019, 020.*
4. **History (week / month)** — segmented control "Week | Month", previous/next buttons and a month picker covering 12 months, member filter; habits × days with text-labelled states ("Done", "Saved", "Not yet"); weekly habits with one week state ("Week complete", "Week saved", "In progress — 2 of 3"); per-member totals. From 768px up the week is a grid. At 360px each habit stacks its name above 7 day chips, with no sideways scrolling (C12). *REQ-017, 020, 023.*
5. **My habits / Habit editor** — list of active and archived habits; form with Title, Goal note, Daily/Weekly, "Times per week" (weekly only); Save, Archive, Delete (with confirmation step). Parents open a child's list from "<child>'s habits" in Family settings. It opens in My habits with the banner "You're changing <child>'s habits — <child> will see a note on My day for every change" (C15). *REQ-008, 009, 010, 015.*
6. **Gems & prizes** — balance with held amount, earning/spending history, prize list with "Claim <prize>" or "12 more gems to go!", my claims with status and "Cancel claim"; "Changes to my habits" list. *REQ-015, 021, 025.*
7. **Parent: Approvals & prizes** — pending claims with "Approve <member>'s <prize>" / "Not this time"; prize list with add/edit/delete. In a two-parent family, a parent's own claims are shown as "Waiting for the other parent"; in a one-parent family they show the approve/decline buttons. *REQ-024, 026.*
8. **Parent: Family settings** — members list with add/edit/remove (confirmation that lists what will be deleted), "Reset <child>'s PIN" and "<child>'s habits" for children, family timezone, "Sign this device out". *REQ-002, 005, 006, 007, 010, 027.*
9. **My PIN** (reached from My habits → "Change my PIN") — Current PIN, New PIN ("Exactly 4 numbers"), "Type the new PIN again" (checked in the browser), "Save my PIN", and a note that a parent can reset a forgotten PIN in Family settings. *REQ-005.*

**Navigation:** every signed-in screen shares one header: the acting member's chip, "Done — switch person", and tabs My day, History, Gems & prizes and My habits. Parents get a fifth **Parent** tab that holds screens 7 and 8 as "Approvals & prizes | Family settings" (C15).

Parent-only controls (the Parent tab, other members' edit buttons) are hidden from children, and the API enforces the same rules (REQ-028).

### Design references

Mockups live in [`docs/design/mvp/`](../../docs/design/mvp/): one PNG per screen or state, plus the interactive [`Family Habit Tracker — Screens.html`](<../../docs/design/mvp/Family Habit Tracker — Screens.html>). The sample family is Dad 🦉 and Mum 🌻 (parents) and Mia 🐬 and Kavi 🦖 (children), and "today" is Tue 20 Oct. PNGs are named `<screen or state> · <viewport width>.png`. A design without a width is a state shown beside its screen at 360px.

Folder: `docs/design/mvp/Family Habit Tracker — Screens-png/`

| # | Screen (section 5) | PNG | What it shows | REQs |
|---|---|---|---|---|
| — | Overview | [Screen map.png](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Screen map.png>) | Index of the 9 screens with their REQs and states | all |
| — | All signed-in screens | [Shared app header + tabs.png](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Shared app header + tabs.png>) | Acting member chip, "Done — switch person", tabs My day / History / Gems & prizes / My habits (plus Parent for parents) | REQ-004, 028 |
| 1 | Passcode entry | [Passcode entry · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Passcode entry · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Passcode entry · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Passcode entry · 1440.png>) | "Family passcode" field, Unlock, "signs out after 5 quiet minutes" | REQ-001, 004 |
| 1 | Passcode entry — state | [Wrong passcode · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Wrong passcode · 360.png>) | "That passcode didn't work — try again" | REQ-001 |
| 1 | Passcode entry — state | [Too many tries · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Too many tries · 360.png>) | "Let's take a short break", wait 15 minutes, Unlock disabled (429) | REQ-001 |
| 1 | Passcode entry — state | [Signed out when idle · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Signed out when idle · 360.png>) | "You were signed out to keep things safe. Unlock to carry on!" | REQ-004 |
| 2 | Family board / Who's checking in? | [Family board · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Family board · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Family board · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Family board · 1440.png>) | Member cards (done today, longest streak, gems), "Tap to check in", "See <name>'s habits" view-only panel, "Updated 10 seconds ago" | REQ-003, 012, 016, 017, 021, 022 |
| 2 | PIN pad | [PIN pad · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/PIN pad · 360.png>) | "Enter Mia's PIN", wrong-PIN state "Not quite — have another go", Back/Delete, forgot-PIN hint | REQ-003, 005 |
| 2 | PIN pad — state | [PIN pad — taking a break · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/PIN pad — taking a break · 360.png>) | Lockout after 5 wrong PINs: "ask a parent, or try again in 5 minutes", keypad disabled | REQ-003 |
| 3 | My day | [My day · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My day · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My day · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My day · 1440.png>) | Today/Yesterday toggle, "Mum updated Reading…" notice with Got it, Check off / Done — Undo, daily streaks, "Check in today to make it 4!", weekly "2 of 3 this week", streak-saver prompt, daily summary with balance | REQ-011, 013, 015, 016, 017, 018, 019, 020, 021 |
| 3 | My day — state | [Yesterday · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Yesterday · 360.png>) | "Forgot to check in yesterday?" — check off for Mon 19 Oct; older days fixed by a parent | REQ-013, 014 |
| 3 | My day — state | [Not enough gems for a saver · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Not enough gems for a saver · 360.png>) | "You need 2 gems for this saver — keep going and you'll get there! You have 1 gem." | REQ-020 |
| 4 | History — week | [History · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/History · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/History · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/History · 1440.png>) | Week/Month toggle, previous/next week, jump to month, member filter, key (Done / Saved / Not yet; weekly: Week complete / Week saved), "15 of 28 done" per member. At 360px each habit stacks above 7 wrapping day chips (no sideways scroll); at 768/1440px it's a habit × day grid. Weekly habits show only Done/Not yet per day plus one week badge ("Week complete — 3 of 3", "Week saved") | REQ-017, 020, 023 |
| 4 | History — month | [Month view · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Month view · 360.png>) | Check-ins per person this month, per-habit month calendars with day states; weekly-habit calendars add a Week column ("Week complete 3 of 3", "Week saved", "In progress 2 of 3", "Coming up"); today (20 Oct) is never Saved | REQ-017, 020, 023 |
| 5 | My habits & habit editor | [My habits & habit editor · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My habits & habit editor · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My habits & habit editor · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My habits & habit editor · 1440.png>) | "5 of 20 active habits", Add a habit, Edit, Archived with "Bring back", "Change my PIN" link | REQ-008, 009, 005 |
| 5 | Habit editor — state | [Habit editor — weekly · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Habit editor — weekly · 360.png>) | Title (≤ 40), Goal note (≤ 60), Daily/Weekly, Times per week, "A new target counts from this week", Save/Archive/Delete | REQ-008, 009 |
| 5 | Habit editor — state | [Delete confirmation · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Delete confirmation · 360.png>) | "Delete Piano for good?" — removes check-ins and savers, spent gems stay spent, earned gems recalculated | REQ-009, 018 |
| 5 | My habits — parent view | [Parent editing Kavi's habits · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent editing Kavi's habits · 360.png>) | Mum editing Kavi's habits; "Kavi will see a note on My day for every change" | REQ-010, 015, 028 |
| 6 | Gems & prizes | [Gems & prizes · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Gems & prizes · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Gems & prizes · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Gems & prizes · 1440.png>) | Balance + "15 gems waiting for approval", My claims (waiting / approved / "Not this time — your gems are back"), Cancel claim, prizes with Claim or "6 more gems to go!", gems earned and spent (incl. 5- and 7-day bonuses), "Changes to my habits" | REQ-015, 018, 019, 021, 025, 026 |
| 7 | Parent: Approvals & prizes | [Parent Approvals & prizes · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent Approvals & prizes · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent Approvals & prizes · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent Approvals & prizes · 1440.png>) | Waiting for a decision (Approve / Not this time), own claim "Waiting for the other parent", prize Edit/Delete (Delete disabled while a claim waits), Add a prize (1–10,000 gems) | REQ-024, 026, 028 |
| 7 | Approvals — state | [One-parent family · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/One-parent family · 360.png>) | "You're the only parent… so you can decide your own claims too" | REQ-026 |
| 8 | Parent: Family settings | [Parent Family settings · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent Family settings · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent Family settings · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Parent Family settings · 1440.png>) | Members (Add / Edit / Remove, "Reset <child>'s PIN", "<child>'s habits"), "A family always needs at least one parent", family timezone, "Sign this device out" | REQ-002, 005, 006, 007, 010, 027 |
| 8 | Family settings — state | [Remove member — confirm · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/Remove member — confirm · 360.png>) | "Remove Kavi from the family?" listing everything deleted; actions for others stay as "a family member" | REQ-007 |
| 9 | My PIN | [My PIN · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My PIN · 360.png>), [· 768](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My PIN · 768.png>), [· 1440](<../../docs/design/mvp/Family Habit Tracker — Screens-png/My PIN · 1440.png>) | Current PIN, New PIN (exactly 4 numbers), type again, Save my PIN, forgot-PIN hint | REQ-005 |
| 9 | My PIN — state | [PINs don't match · 360](<../../docs/design/mvp/Family Habit Tracker — Screens-png/PINs don't match · 360.png>) | "Those two PINs don't match yet — try typing the new one again" | REQ-005 |

Every requirement with a UI appears above. REQ-012 (simultaneous check-ins) shows only through the board's refresh label, and REQ-028 only through which controls each role sees. Neither has a dedicated mockup, as expected.

Where a mockup and the spec disagree, **the spec wins**. C12–C15 are resolved, and the History · 360/768/1440 and Month view · 360 mockups were updated on 2026-10-20 to match REQ-023. One sample-data inconsistency is noted in C16 (section 9).

## 6. Non-functional requirements

- **Privacy — data minimisation:** Member stores only nickname, avatar emoji and role; the API rejects extra fields with `422` [child-data-privacy #1]. Ages in the intent are not stored. The hashed PIN sits only in a separate MemberCredential record, which no response schema exposes, as the amended [child-data-privacy #1] allows.
- **Privacy — logging:** logs, exceptions, error details and request logs contain IDs only — never nicknames, passcodes or PINs (and, as a project choice, no habit or prize titles). Request bodies of `/sessions` and `/members/*/credentials` are never logged [child-data-privacy #2]. Verified by grep plus a test that captures logs during sign-in, failed sign-in, PIN entry and member creation.
- **Privacy — no tracking:** no analytics, ad SDKs, trackers or externally hosted fonts/scripts/CDNs; a Content-Security-Policy of `default-src 'self'` enforces this [child-data-privacy #5]. No ads (intent).
- **Privacy — deletion:** member deletion cascades at database level, proved by an API test [child-data-privacy #4].
- **Security:** HTTPS only (HSTS); session cookie HttpOnly, Secure, SameSite=Lax; CSRF protection on state-changing requests; passcode and PINs stored only as slow salted hashes; rate limits per REQ-001/REQ-003; acting member and family session both end after 5 minutes without person-initiated activity, enforced on the server (REQ-004). Every endpoint except passcode entry returns `401` without a session [child-data-privacy #3].
- **Accessibility:** WCAG 2.2 AA contrast [family-ux #5]; 44×44px targets [family-ux #2]; full keyboard operation with visible focus [family-ux #1]; labelled icons and accessible names [family-ux #4] [family-ux #7]; status never shown by colour alone. Zero serious/critical axe violations on each screen.
- **Device support:** latest two versions of Safari (iPadOS), Chrome (Android tablets, laptops), Edge and Firefox; viewports 360–1440px with no horizontal scroll [family-ux #1]; touch, mouse and keyboard.
- **Performance:** check-in endpoint p95 < 300 ms server-side; My day interactive < 2 s on a mid-range tablet over 4G; passcode + PIN + one check-off < 60 s end to end (intent), and ≤ 2 taps from My day [family-ux #3].
- **Concurrency:** check-ins are idempotent per (habit, date) with a unique constraint; gem spends (streak savers, claims) are checked against the balance in one transaction, so two devices can't overspend.
- **Retention:** all history is kept for at least 13 months; no automatic deletion in v1.
- **Hosting:** cloud-hosted and reachable from anywhere over HTTPS (intent). No database backups in this version (C11).
- **Future multi-family:** every family-owned row carries `family_id` and every query is scoped by the session's family (REQ-028).
- **API documentation:** OpenAPI at `/docs` matches implemented routes, schemas and status codes [api-conventions #7].
- **Measuring success (intent):** no analytics or extra UI; the author checks both measures with read-only database queries [child-data-privacy #5].
  - *Kids open the app daily without reminders:* in days 31–60 after launch, each child has at least one check-in they made themselves (`created_by_member_id = member_id`) on at least 25 of 30 family days. This is a proxy: the app can't tell whether a child was reminded, so it counts their own check-ins.
  - *Streaks last longer than on paper:* before launch, the author records each child's typical longest streak on the paper chart; after one month, each child's best `best_streak` (REQ-016) is compared with it.

## 7. Test strategy

Every endpoint gets a pytest API test with a success case and at least one failure case [api-conventions #6]. E2E tests are Playwright, run at 360, 768 and 1440px, select elements only by role and accessible name [family-ux #7], and assert `scrollWidth <= innerWidth` on every screen [family-ux #1].

| REQ | Unit | API | E2E |
|---|---|---|---|
| REQ-001 | Passcode hash verify; rate limiter windowing | Correct → 201 + cookie; wrong → 401; 11th attempt → 429, even with the correct passcode; every data route without cookie → 401; captured logs contain no passcode | Unlock with passcode; wrong passcode shows kind error |
| REQ-002 | — (no logic beyond session delete) | Parent DELETE → 204, replayed cookie → 401; child → 403 | Parent signs device out, lands on Passcode entry |
| REQ-003 | PIN lockout counter | Correct PIN → acting member set; wrong → 401 with `WWW-Authenticate: MemberPIN`; 6th → 429; with member A locked out, member B's correct PIN still works; write with no acting member → 403; logs have IDs only | Tap avatar, type PIN on keypad by keyboard and touch |
| REQ-004 | Idle-timeout calculation for acting member and family session; background requests ignored | After simulated 5 min idle: read and write → 401 (`FamilyPasscode`), including a PIN entry; a write after "Done — switch person" → 403; background-refresh requests don't extend expiry; a person-initiated request at 4 min does | "Done — switch person" returns to board; after 5 idle minutes (simulated clock) the device shows Passcode entry with kind copy; two browser contexts act as different members |
| REQ-005 | PIN format validation; current-PIN check feeds lockout counter | Self set with correct current PIN → 204; missing current PIN → 422; wrong current PIN → 401, 5th wrong → 429; parent resets child without current PIN → 204 + adjustment; child sets other → 403; "12a4" → 422 | Change own PIN on My PIN; mismatched confirmation shows kind message and sends nothing; parent resets child PIN, child unlocks with new PIN |
| REQ-006 | Nickname/emoji validation | Create → 201; extra `birthdate` field → 422; duplicate nickname → 422; member edits own nickname/avatar → 200; child changes role → 403; demote last parent → 422 | Parent adds a child member |
| REQ-007 | — (enforced by DB cascade) | Delete member → 204; their check-ins, habits, savers, transactions, claims, credential, adjustments all gone (API and DB query); actor columns null; unknown ID → 404; remove last parent → 422 and nothing deleted | Parent removes member after confirmation |
| REQ-008 | Habit validation (title, weekly target, 20 limit) | Daily/weekly create → 201; weekly without target → 422; 21st → 422; child for other → 403 | Create a weekly habit "Piano, 3 times a week" |
| REQ-009 | Target effective-from-week resolution | Rename keeps streak; archive hides from today list; unarchive restarts the streak from today; delete → 204 removes check-ins, recalculates earned gems and leaves spent gems unchanged; unknown → 404 | Archive a habit, see it in History only |
| REQ-010 | Permission matrix | Parent edits child habit → 200 + adjustment; parent edits other parent → 403; child edits sibling → 403 | Parent opens "Kavi's habits" from Family settings and edits a goal; child sees no Parent tab |
| REQ-011 | — | PUT today → 201; DELETE → 204 and gems revert; weekly habit checked in today counts once toward week progress, a repeat PUT doesn't add another | Check off in ≤ 2 taps from My day; keyboard-only check-off; timed passcode + PIN + check-off < 60 s |
| REQ-012 | — | Two concurrent PUTs → one row, 201 + 200; concurrent PUT/DELETE leaves consistent balance | Two browser contexts check in at once; board updates within 30 s |
| REQ-013 | Window check in family timezone | Yesterday → 201; 2 days ago → 422; future → 422; before created_on → 422 | Toggle to Yesterday and check off |
| REQ-014 | Recalculation after correction; shortfall written off to exactly 0 | Parent adds child check-in 30 days back → 201 + adjustment; parent edits other parent's old day → 403; removing check-ins after spending → balance 0 (not negative) and a `correction_writeoff` row; next check-in → balance 1; re-adding the removed check-ins → gems restored and write-off kept | Parent corrects a child's day in History |
| REQ-015 | Adjustment text rendering | Adjustments listed for target, newest first, last 12 months only; a parent's own list is empty; ack → 200; other member ack → 403; stored rows hold IDs only | Child sees "updated" notice and dismisses it |
| REQ-016 | Streak function: runs, saved days, today pending, best streak, timezone boundaries | HabitRead streak fields match fixture history | Streak shown on My day after check-off |
| REQ-017 | Week completion with changing targets; in-progress week | Weekly streak fields match fixtures | Weekly progress "2 of 3" updates |
| REQ-018 | Gem function: day 1–30 table (5→+5, 7→+7, 12→+5, 14→+7…); per-habit gems; recompute after backfill joins runs | Balance after scripted check-ins equals expected | Gem count animates up after check-off |
| REQ-019 | Weekly gem function (weeks 5, 10, 15 bonuses; no 7-week bonus) | Balance after scripted weeks | — (covered by unit + API; no extra UI behaviour beyond REQ-021) |
| REQ-020 | Saver eligibility (7-day window, must follow a done/saved day), rising cost, reset on new run, weekly variant | 1st saver → 201 cost 1, 2nd cost 2; insufficient → 409; saver for today, 8 days back or a day after a gap → 422 and balance unchanged; check-in on saved day → 409; parent saves for child → adjustment | Use a streak saver from My day; insufficient-gems copy contains no "missed"/"failed" |
| REQ-021 | Balance = earned − spent − held + write-offs, never below 0 | Transactions list includes derived earnings and write-offs; another member → 403 | Gems & prizes shows balance and held amount |
| REQ-022 | — | GET members/habits with family session and no acting member → 200 | Board at 360px is one column; shows all members' progress; a child opening a sibling's card sees no edit controls, a parent opening a child's card does |
| REQ-023 | Day-state mapping; weekly week-state mapping (complete / saved / in progress, never per-day "Saved"); today never "Saved" | Range > 62 days → 422; data from 12 months ago returned | Navigate back 12 months in Month view; states have text labels; week view at 360px has `scrollWidth <= clientWidth` for every card and no clipped day labels |
| REQ-024 | Cost validation | Parent create → 201; child → 403; delete with pending claim → 409; delete otherwise → 204 and past claims keep title and cost; edit cost → pending claim keeps its original cost | Parent adds a prize |
| REQ-025 | Hold/release arithmetic | Claim with enough → 201 + hold; not enough → 409; cancel → gems released | Child claims a prize; sees "more gems to go" when short |
| REQ-026 | Approver-eligibility rule (parent count) | Approve → spent; decline → released; own claim with two parents → 403; own claim with one parent → 200; non-pending → 409 | Parent approves claim; child sees approval; parent declines a claim, claimant sees "Not this time — your gems are back." and their balance restored |
| REQ-027 | Family-date conversion across DST and midnight | Check-in at 23:59 local counted for local date; datetimes carry offset; bad tz → 422; timezone change leaves existing check-in dates unchanged and the next check-in uses the new zone | — (timezone not observable in-browser beyond REQ-013 E2E) |
| REQ-028 | Permission matrix table | Each write endpoint: no session → 401, no acting member → 403, wrong role → 403; other family's ID → 404 | Child sees no parent-only controls |

Cross-cutting: a log-capture test for [child-data-privacy #2]; a dependency/HTML check for trackers and external hosts [child-data-privacy #5]; an OpenAPI check that every route has the `/api/v1` prefix, schemas and declared status codes [api-conventions #1] [api-conventions #2] [api-conventions #7]; an axe scan of each screen [family-ux #5]; a copy lint for "failed", "missed", "bad" [family-ux #6].

Non-functional (section 6):
- **Security headers:** API test asserts `Content-Security-Policy: default-src 'self'` and `Strict-Transport-Security` on responses, and that the session cookie is `HttpOnly; Secure; SameSite=Lax`.
- **CSRF:** a state-changing request without a valid CSRF token (or the equivalent mechanism chosen in the plan) → `403`.
- **Performance:** a scripted load test shows the check-in PUT p95 < 300 ms server-side; a Playwright run with throttled 4G and CPU shows My day interactive in < 2 s.
- **Browsers:** E2E runs as Playwright Chromium, Firefox and WebKit projects. Edge is covered by Chromium; iPadOS Safari is approximated by WebKit and checked by hand on the family's tablet before release.
- **Hosting:** a post-deploy smoke test confirms the app answers over HTTPS from outside the home network.

## 8. Answers to the intent's open questions

1. **Daily gem per habit or once per day?** — **Per day, per habit** (REQ-018): each habit checked in on a day earns 1 gem. *Decided by the author (C2).*
2. **Day 7 both bonuses? How do they repeat?** — **Yes**, day 5 gives +5 and day 7 gives a further +7. Bonuses repeat on **a 7-day cycle**: days 5, 7, 12, 14, 19, 21, … *Decided by the author (C2).*
3. **Missed-day exemption** — spending gems **keeps the streak alive** (the saved day bridges the run but earns no gem and doesn't add to the count); the cost **rises within one unbroken run and resets to 1 only when a new run starts**; with too few gems the saver is **refused (409)** and the streak ends; the **same rule applies to weekly habits**, per week; a saver can be used only **within 7 days of the day it covers**, and only directly after a done/saved day (REQ-020). *Decided by the author for this version (C3); may be revisited once the family has used it.*
4. **Can a parent change a kid's data without the kid knowing?** — **No.** Every parent change creates an adjustment the child sees as a notice and in a history list (REQ-015). This keeps the kids' trust in the game. *Decided by the author (2026-10-20).*
5. **Signing out on shared devices** — two layers: a family session per device (family passcode [child-data-privacy #3]) and an acting member unlocked with a personal 4-digit PIN (REQ-003). The acting member clears on "Done — switch person"; both the acting member and the family session end after **5 minutes without activity**, so a device never stays signed in longer than that (REQ-004). Parents can also sign a device out right away (REQ-002). *Decided by the author (C1 option B; C7 timeout).*
6. **Check in for a past day?** — Members can check in for **today or yesterday**; parents can correct a child's check-ins for **any day** (REQ-013, 014). *Approved by the author (C7).*

## 9. ⚠️ Concerns

### Resolved by the author (2026-10-20)

- **C1 — Per-person login vs. family passcode and minimal member data** ([child-data-privacy #1] vs. [child-data-privacy #3] vs. the intent's "own local account"). **Decision: option B.** A family passcode session plus a 4-digit PIN for each member, stored as a hash in a separate `MemberCredential` entity so that Member stays limited to nickname, avatar and role (REQ-003, REQ-005).
- **C2 — Gem rules.** **Decision:** 1 gem per day *per habit*; bonuses repeat on a 7-day cycle (days 5, 7, 12, 14, …) (REQ-018).
- **C3 — Streak saver economics.** **Decision for this version:** the cost rises within one unbroken run and resets only when a new run starts; a saver can be used only within 7 days of the day it covers (REQ-020).
- **C5 — Parent prize claims.** **Decision:** another parent must approve or decline a parent's claim; if the family has only one parent, that parent can decide their own claim (REQ-026).
- **C6 — Negative balances after corrections.** **Decision:** a balance never goes below 0. Any shortfall is written off, and the member can start earning again straight away (REQ-014, REQ-021).
- **C7 — Assumptions.** All approved (20 active habits, Monday weeks, setup command, done/not-done check-ins with a goal note, today/yesterday backfill, parents can't adjust each other, gem totals visible but not history, ≥ 13 months retention), **except the timeout**. **Decision:** the acting member *and* the family session both end after **5 minutes without activity**, replacing the earlier 2-minute/30-day proposal (REQ-004).

- **C9 — Rule #1 wording.** **Decision:** [child-data-privacy #1] amended in `.claude/skills/child-data-privacy/SKILL.md` to allow a hashed member PIN, only in a separate credential record that is never returned by the API and is deleted with the member. The spec now matches the rule text.
- **C10 — Consequences of the 5-minute timeout.** **Accepted:** most visits start from Passcode entry (passcode + PIN each time, still within the 60-second target, REQ-011); a tablet can't be an always-on family board; the passcode rate limit stays at 10 failures per 15 minutes; background refreshes don't extend sessions (REQ-004).
- **C6 follow-on — write-off is not reversed.** **Decision:** if a parent removes check-ins (triggering a write-off) and later adds them back, the child gets the gems back *and* keeps the write-off (REQ-014).
- **C11 — Backups.** **Decision:** no database backups in this version (section 6, section 10).
- **C8 — Intent status.** **Accepted:** the author confirmed the intent is accepted; committing the status change is not a blocker for the spec.
- **C4 — Phone vs. tablet** (informational, no decision needed). [family-ux] says "often on a phone"; the family uses tablets and laptops. The 360–1440px rule [family-ux #1] covers both.

### Found during Phase 1 — resolved by the author (2026-10-20)

- **C17 — REQ-004 idle write status.** The acting member and the family session share one 5-minute idle timer, so when the acting member times out the session has ended too, and the earlier "next write returns `403`" could not happen. **Decision:** after 5 idle minutes every request returns `401`; `403` stays the answer for a write with no acting member while the session is still active (e.g. after "Done — switch person"). REQ-004 and §7 updated.
- **C18 — Telling a wrong PIN from an ended session.** Both are `401` on `PATCH /sessions/current`, and the client must react differently (stay on the PIN pad vs. go to Passcode entry). **Decision:** each `401` carries `WWW-Authenticate: FamilyPasscode` or `MemberPIN` (§4 "Which `401`"). REQ-003 and REQ-005 statuses are unchanged.

### Design vs. spec — resolved by the author (2026-10-20)

- **C12 — History week grid clipped at 360px.** **Decision:** at 360px each habit stacks its name and week state above 7 wrapping day chips, with no sideways scrolling anywhere [family-ux #1] (REQ-023, section 5 screen 4). **Design updated and checked 2026-10-20** (History · 360).
- **C13 — Saved states the spec doesn't allow.** **Decision:** keep REQ-020 and fix the mockups. Weekly habits get one week-level state (Week complete / Week saved / In progress — x of N) and no per-day "Saved"; today is never "Saved" (REQ-023). **Design updated and checked 2026-10-20** (History · 360/768/1440, Month view · 360).
- **C14 — My PIN asks for current PIN and confirmation.** **Decision:** the spec follows the design. `current_pin` is required to change your own PIN (wrong → `401`, counts toward lockout → `429`), not needed for a parent reset; the confirmation field is checked in the browser only (REQ-005, API table). No design change needed.
- **C15 — Where parents edit a child's habits.** **Decision:** the spec follows the design. A Parent tab holds Approvals & prizes and Family settings, and "<child>'s habits" in Family settings opens the child's list (section 5).

### Still open (minor, not blocking the plan)

- **C16 — Sample data in the History mockups breaks the streak-saver rule.** In the updated History and Month view mockups, every "Saved" day comes straight after a "Not yet" day (e.g. Dad · Exercise: Sat Not yet, Sun Saved; Mia · Reading: 7 Oct Not yet, 8 Oct Saved). REQ-020 allows a saver only on a day that directly follows a done or saved day, so these runs would already have ended. This affects only the illustrative data, not the layout or the spec. Options: (a) leave it, and note that E2E fixtures must follow REQ-020 rather than copy the mockup data (recommended); (b) ask Claude Design to move each "Saved" so it follows a "Done" day.

## 10. Out of scope

- Reminders, notifications, email or push messages (intent).
- Integrations with external apps, social media, fitness or water trackers (intent).
- Social-network features (comments, likes, sharing outside the family) and ads (intent).
- Multiple families, self-service family sign-up, billing or commercial features (intent) — only the `family_id` scoping is built.
- Changing the family passcode from the UI (done with the setup command in v1).
- Quantity tracking (minutes, litres) and partial check-ins; habits scheduled on specific weekdays only.
- Shared/family habits that several members complete together (e.g. "family time" is tracked as each member's own habit).
- Leaderboards or member-vs-member rankings beyond the family board.
- Undoing a streak saver or refunding it; prize stock or quantity limits; prize pictures.
- Data export, account recovery beyond a parent PIN reset, and offline mode.
- Database backups and restore (C11).
- Native mobile apps; the app is a responsive web app only.
