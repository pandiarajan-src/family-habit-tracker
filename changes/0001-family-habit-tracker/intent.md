# Intent: Family habit tracker

**Author:** Pandiarajan · **Function:** Product · **Status:** Accepted · **Date:** 2026-10-20

## Problem

In our family it's hard to keep the kids (and honestly us parents) consistent with small daily and weekly habits, like reading, doing exercise for 40 minutes, drinking 3 liters of water, practising piano and spending family time.

Today we use a paper chart on the fridge. It gets lost, nobody remembers streaks, and we can't see the week or month at a glance. The kids have no fun reason to keep coming back to it.

## Proposed outcome

A simple web app where each family member checks off their habits each day and we all see progress together. Kids should find it fun. Habits and progress are gamified with streaks, winning gems and getting prizes; the prize a person earns depends on how many gems they win.

- Each family member can set their own habits and goals, whether they are a kid or a parent.
- Parents can adjust the kids' habits and goals. For example, they can edit them or correct a check-in or check-off.
- It's a family view: anyone in the family can see everyone's habits, progress, streaks and gems.
- The family can see the week and the month at a glance, and history is kept for at least a year.
- Checking in takes a minute at most. Family members can check in at the same time on different devices, or one after another on the same device.

**Gems for daily habits**

- 1 gem for each day's check-in.
- 5 bonus gems for completing 5 continuous days, and an additional 7 bonus gems for completing 7 continuous days. The 5-day and 7-day bonuses keep repeating.

**Gems for weekly habits**

- Weekly streaks work the same way as daily ones: 1 gem per weekly goal.
- 5 bonus gems for completing 5 continuous weeks. Weekly habits have no equivalent of the 7-day bonus.

**Missed-day exemption**

- A missed day can be exempted by spending gems. The cost goes up with each missed day: the first missed day costs 1 gem, the second costs 2 gems, and so forth. So missing 2 days costs 3 gems in total.

**Prizes**

- Parents decide the prizes and set a gem threshold for each prize, based on what the prize costs.
- When a prize is claimed, its gems are spent.
- Parents approve each prize claim.

## Affected users and systems

- **Family members (first version):** Father (45), Mother (43), Daughter 1 (15), Daughter 2 (11).
- **Parents:** set up the prizes, plus their own habits and goals, check them off, and track their streaks, gems and prizes. They also approve prize claims and can adjust the kids' habits, goals and check-ins.
- **Kids:** set their own habits and goals, check them off, and track their streaks, gems and prizes.
- **Devices:** the kids don't have phones. They use tablets, and the family also shares laptops. Assume everyone uses shared devices.
- **Systems:** a new cloud-hosted web app (none exists today), with sign-in through each person's own local account.

## Constraints

- It must be hosted in the cloud so the family can reach it from wherever they are.
- It must be protected by local login account.
- It must work on shared devices (tablets and the family laptops).
- No ads. Not a full social network.
- The first version is for my family only, but I may make this a commercial application later, where it would need to support multiple families. Early decisions shouldn't rule that out.

## Success measures

- After a month, the kids open the app every day without being reminded, to track their streaks and win gems and prizes.
- Streaks last longer than they did with the paper chart.

## Out of scope

- Reminders and notifications. The app relies on the kids opening it themselves.
- Syncing with any external apps: no social media, no fitness trackers, no water-tracking apps.
- Social-network features and ads.
- Supporting multiple families or commercial use. This version is for one family only.

## Open questions

- Is the daily gem earned per habit checked in, or once per day when all of that day's habits are done?
- On day 7 of a streak, does the person get both bonuses (5 from day 5 plus 7 from day 7)? When the bonuses "keep repeating", does the cycle restart after day 7, or do the bonuses fall on every multiple of 5 and of 7 (days 5, 7, 10, 14, 15, …)?
- Missed-day exemption: does spending gems keep the streak alive? Does the cost reset to 1 gem after the person completes a day again? What happens if they don't have enough gems? Does the same exemption apply to weekly habits?
- Can a parent change a kid's habits or check-ins without the kid knowing, or should the kid see what changed?
- On shared devices, how should signing out work so that someone else can't check off habits on another person's behalf?
- Can a person check in for a past day (for example, if they forgot yesterday), or only for today?
