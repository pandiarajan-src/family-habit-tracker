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
