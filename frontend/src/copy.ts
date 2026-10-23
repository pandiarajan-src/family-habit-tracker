// Every user-facing string lives here [family-ux #6], one section per screen.
// Phases 5–9 append to their own section; copy.test.ts rejects shaming words.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const copy = {
  appTitle: 'Family Habit Tracker',
  loading: 'Loading…',

  passcode: {
    tagline: 'Small daily wins, together.',
    title: 'Welcome back!',
    lead: 'Unlock this device with your family passcode.',
    label: 'Family passcode',
    hint: "Ask a parent if you're not sure.",
    empty: 'Type the family passcode first',
    unlock: 'Unlock',
    unlocking: 'Unlocking…',
    wrong: "That passcode didn't work — try again",
    waitTitle: "Let's take a short break",
    waitText: 'That was a lot of tries. Please wait 15 minutes, then try again.',
    tryAgainAt: (time: string) => `You can try again at ${time}.`,
    idleTitle: 'You were signed out to keep things safe.',
    idleText: 'Unlock to carry on!',
    trouble: "We couldn't reach the app just now. Check the internet and try again.",
    footer: "Only our family can see what's inside. This device signs out after 5 quiet minutes.",
  },

  board: {
    title: "Who's checking in?",
    lead: (date: string) => `Tap your card, then enter your PIN. ${date}.`,
    updatedNow: 'Updated just now',
    updatedSeconds: (s: number) => `Updated ${s} seconds ago`,
    updatedMinutes: (m: number) => `Updated ${plural(m, 'minute', 'minutes')} ago`,
    tapToCheckIn: 'Tap to check in',
    doneToday: (done: number, due: number) => `${done} of ${due} done today`,
    noHabits: 'No habits yet',
    longest: 'Longest',
    seeHabits: (name: string) => `See ${name}’s habits`,
    habitsToday: (name: string) => `${name}’s habits today`,
    viewOnly: 'View only',
    nothingYet: (name: string) => `${name} hasn't added any habits yet.`,
    loadTrouble: "We couldn't load the board just now — we'll keep trying.",
    tryAgain: 'Try again',
  },

  habit: {
    days: (n: number) => plural(n, 'day', 'days'),
    weeks: (n: number) => plural(n, 'week', 'weeks'),
    best: (text: string) => `Best ${text}`,
    thisWeek: (done: number, target: number) => `${done} of ${target} this week`,
    done: 'Done',
    notYet: 'Not yet',
    streakLabel: (text: string) => `Streak: ${text}`,
  },

  gems: {
    count: (n: number) => plural(n, 'gem', 'gems'),
  },

  myDay: {
    greeting: (name: string) => `Hi ${name}! Here’s your day`,
    yesterdayTitle: 'Yesterday',
    whichDay: 'Which day',
    today: 'Today',
    yesterday: 'Yesterday',
    daily: 'Every day',
    weekly: 'This week',
    checkOff: 'Check off',
    doneUndo: 'Done — Undo',
    saved: 'Saved',
    makeIt: (n: number) => `Check in today to make it ${n}!`,
    countsFor: (day: string) => `Counts for ${day}`,
    savedDay: (day: string) => `${day} was saved with a streak saver`,
    weekComplete: 'Week complete — nice one!',
    moreThisWeek: (n: number) => `${n} more this week to keep your streak going`,
    yesterdayNoticeTitle: 'Forgot to check in yesterday?',
    yesterdayNoticeText: (day: string) =>
      `Check off anything you did on ${day}. Older days can be fixed by a parent.`,
    nothingYesterday: 'None of your habits had started yet yesterday.',
    noHabits: "You haven't added any habits yet. Add your first one in My habits!",
    progress: 'My progress',
    doneOn: (done: number, total: number, when: 'today' | 'yesterday') =>
      `${done} of ${total} done ${when}`,
    cheerAll: 'Everything done — amazing!',
    cheerNone: 'Let’s get started!',
    cheerSome: 'Great going — keep it up!',
    balance: 'Balance',
    longest: 'Longest',
    gemRules: '1 gem for each habit you check off. 5-day and 7-day streaks earn bonus gems.',
    saveTrouble: "We couldn't save that just now. Please try again.",
    alreadySaved: 'That day was saved with a streak saver, so it’s already looked after.',
    loadTrouble: "We couldn't load your day just now.",
    tryAgain: 'Try again',
  },

  history: {
    lead: 'Look back over the last 12 months.',
    whichView: 'Week or month',
    week: 'Week',
    month: 'Month',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    jumpToMonth: 'Jump to month',
    thisWeek: (range: string) => `This week · ${range}`,
    lastWeek: (range: string) => `Last week · ${range}`,
    whose: 'Whose history',
    everyone: 'Everyone',
    key: 'Key:',
    weeklyKey: 'Weekly habits:',
    habit: 'Habit',
    archived: 'Archived',
    dayStates: { done: 'Done', saved: 'Saved', not_yet: 'Not yet' },
    blank: { later: 'Coming up', before: 'Not started', after: 'Put away' },
    weekStates: {
      complete: (done: number, target: number) => `Week complete — ${done} of ${target}`,
      saved: () => 'Week saved',
      in_progress: (done: number, target: number) => `In progress — ${done} of ${target}`,
      below_target: (done: number, target: number) => `A quieter week — ${done} of ${target}`,
      coming_up: () => 'Coming up',
    },
    weekComplete: 'Week complete',
    weekSaved: 'Week saved',
    weekColumn: 'Week',
    doneOf: (done: number, total: number) => `${done} of ${total} done`,
    daysOf: (done: number, total: number) => `${done} of ${total} days`,
    checkIns: (n: number) => plural(n, 'check-in', 'check-ins'),
    monthSoFar: (month: string) => `${month} so far — check-ins per person`,
    monthTotals: (month: string) => `${month} — check-ins per person`,
    habitTitle: (name: string, habit: string) => `${name} · ${habit}`,
    habitDays: (habit: string, period: string) => `${habit}, ${period}`,
    noHabits: (name: string) => `${name} had no habits yet in this period.`,
    loadTrouble: "We couldn't load the history just now.",
    tryAgain: 'Try again',
  },

  saver: {
    title: (cost: number) => `Save your streak for ${plural(cost, 'gem', 'gems')}?`,
    restDay: (habit: string, day: string) =>
      `${habit} had a rest on ${day}. A streak saver keeps your streak going.`,
    restWeek: (habit: string, monday: string) =>
      `${habit} had a quieter week from ${monday}. A streak saver keeps your streak going.`,
    use: 'Use a streak saver',
    /** Screen-reader end of the button name: "Use a streak saver for Reading on Tue 14 Oct". */
    useFor: (habit: string, period: string) => `for ${habit} on ${period}`,
    notNow: 'Not now',
    notNowFor: (habit: string, period: string) => `— ${habit} on ${period}`,
    weekOf: (monday: string) => `the week of ${monday}`,
    short: (cost: number, balance: number) =>
      `You need ${plural(cost, 'gem', 'gems')} for this saver — keep going and you'll get there! You have ${plural(balance, 'gem', 'gems')}.`,
    done: (period: string, cost: number) =>
      `Streak saved! ${period} now shows “Saved”. ${plural(cost, 'gem', 'gems')} spent.`,
    gone: "That one can't be saved any more — let's keep going from today!",
  },

  changes: {
    someone: 'A parent',
    aHabit: 'a habit',
    gotIt: 'Got it',
    /** Screen-reader end of "Got it": which notice it dismisses. */
    gotItFor: (title: string) => `— ${title}`,
    title: {
      habit_created: (who: string, habit: string, day: string) => `${who} added ${habit} on ${day}`,
      habit_updated: (who: string, habit: string, day: string) =>
        `${who} updated ${habit} on ${day}`,
      habit_archived: (who: string, habit: string, day: string) =>
        `${who} archived ${habit} on ${day}`,
      habit_deleted: (who: string, habit: string, day: string) =>
        `${who} removed ${habit} on ${day}`,
      check_in_added: (who: string, habit: string, day: string) =>
        `${who} updated ${habit} for ${day}`,
      check_in_removed: (who: string, habit: string, day: string) =>
        `${who} updated ${habit} for ${day}`,
      streak_saver_used: (who: string, habit: string, day: string) =>
        `${who} saved your streak on ${habit} for ${day}`,
      pin_reset: (who: string, _habit: string, day: string) => `${who} reset your PIN on ${day}`,
    },
    text: {
      habit_created: 'It’s on your list now.',
      habit_updated: 'Its details changed.',
      habit_archived: 'It’s put away for now, and its history is kept.',
      habit_deleted: 'It’s gone from your list.',
      check_in_added: 'A check-in was added for that day.',
      check_in_removed: 'A check-in was taken off that day.',
      streak_saver_used: 'Some of your gems paid for a streak saver.',
      pin_reset: 'Use your new PIN next time you check in.',
    },
  },

  pin: {
    title: (name: string) => `Enter ${name}’s PIN`,
    progress: (filled: number, length: number) => `${filled} of ${length} digits entered`,
    keypad: 'PIN keypad',
    back: 'Back',
    delete: 'Delete',
    checking: 'Checking…',
    wrong: 'Not quite — have another go',
    locked: (minutes: number) =>
      `Let’s take a break — ask a parent, or try again in ${plural(minutes, 'minute', 'minutes')}.`,
    forgot: 'Forgot your PIN? A parent can reset it in Family settings.',
    trouble: "We couldn't check that PIN just now. Please try again.",
  },

  header: {
    parentSuffix: ' (parent)',
    switchPerson: 'Done — switch person',
    tabs: 'Main',
  },

  tabs: {
    myDay: 'My day',
    history: 'History',
    gems: 'Gems & prizes',
    habits: 'My habits',
    parent: 'Parent',
  },

  parent: {
    sections: 'Parent',
    approvals: 'Approvals & prizes',
    settings: 'Family settings',
  },

  screens: {
    myDay: 'My day',
    history: 'History',
    gems: 'Gems & prizes',
    habits: 'My habits',
    editHabit: 'Edit habit',
    myPin: 'My PIN',
    approvals: 'Approvals & prizes',
    settings: 'Family settings',
  },

  comingSoon: {
    title: 'This screen is on its way',
    text: 'It will be ready soon. Your check-ins, streaks and gems are safe.',
  },
} as const
