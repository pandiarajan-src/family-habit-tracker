#!/usr/bin/env bash
# Create the family, add members, or update or reset an existing family.
#
#   scripts/family-setup.sh
#
# - No family yet: asks for the timezone, the family passcode and the first parent, then
#   offers to add more members until you type "exit".
# - A family already exists: update it (change a member's nickname, avatar, role or PIN,
#   add a member, or change the family passcode), or delete it and start again.
#
# Works on the database in DATABASE_URL (from the environment, else the repo's .env, else
# backend/family_habit_tracker.db). The database work is done by `python -m app.cli`
# (family-* and member-* commands), so the rules match the app. Passcodes and PINs are typed
# without echo and sent on stdin, never as arguments, so they stay out of shell history and
# the process list. Written for bash 3.2 (the macOS default).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_TIMEZONE="Europe/London"
# The backend CLI, run from backend/. Tests point it at their own interpreter.
FAMILY_CLI="${FAMILY_CLI:-uv run --quiet python -m app.cli}"
PIN_RE='^[0-9]{4}$'
NUMBER_RE='^[0-9]+$'

ANSWER="" SECRET="" NICKNAME="" AVATAR="" ROLE="" FAMILY_TZ=""
M_IDS=() M_ROLES=() M_EMOJIS=() M_NICKS=()

say() { printf '%s\n' "$*" >&2; }
heading() { printf '\n== %s ==\n' "$*" >&2; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

stop() {
  say ""
  say "Stopped. Anything already saved stays saved."
  exit 1
}
trap stop INT

# Read .env like `make` does, but never override a variable that is already set.
load_env() {
  local file="$ROOT/.env" line key
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    key="${line%%=*}"
    if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [ -z "${!key+set}" ]; then
      export "$key=${line#*=}"
    fi
  done <"$file"
}

# Run a backend CLI command; its messages go straight to the terminal.
cli() { (cd "$ROOT/backend" && $FAMILY_CLI "$@"); }

# Print `key=value` lines for the CLI's stdin: fields key1 value1 key2 value2 ...
fields() {
  while [ $# -gt 1 ]; do
    printf '%s=%s\n' "$1" "$2"
    shift 2
  done
}

# ask "Question" [default] -> ANSWER (trimmed; the default when left empty)
ask() {
  local prompt="$1" default="${2-}"
  if [ -n "$default" ]; then prompt="$prompt [$default]"; fi
  IFS= read -r -p "$prompt: " ANSWER || stop
  ANSWER="${ANSWER#"${ANSWER%%[![:space:]]*}"}"
  ANSWER="${ANSWER%"${ANSWER##*[![:space:]]}"}"
  if [ -z "$ANSWER" ]; then ANSWER="$default"; fi
}

# ask_secret "Label" pin|passcode [optional] -> SECRET, typed twice without echo.
# With "optional", an empty first answer means "keep the current one" (SECRET="").
ask_secret() {
  local label="$1" kind="$2" optional="${3-}" first second
  while true; do
    IFS= read -r -s -p "$label: " first || stop
    say ""
    if [ -z "$first" ] && [ -n "$optional" ]; then
      SECRET=""
      return 0
    fi
    if [ "$kind" = pin ] && ! [[ "$first" =~ $PIN_RE ]]; then
      say "A PIN is exactly 4 numbers."
      continue
    fi
    if [ "$kind" = passcode ] && { [ ${#first} -lt 6 ] || [ ${#first} -gt 128 ]; }; then
      say "A family passcode is 6-128 characters."
      continue
    fi
    IFS= read -r -s -p "$label again: " second || stop
    say ""
    if [ "$first" != "$second" ]; then
      say "Those don't match yet, try again."
      continue
    fi
    SECRET="$first"
    return 0
  done
}

# ask_identity [member_id current_nickname current_emoji] -> NICKNAME, AVATAR (checked)
ask_identity() {
  local member_id="${1-}" current_nickname="${2-}" current_emoji="${3-}"
  while true; do
    ask "Nickname (1-20 characters)" "$current_nickname"
    NICKNAME="$ANSWER"
    say "Avatar: one emoji such as 🦉 🌻 🐬 🦖 (emoji picker: Ctrl+Cmd+Space on a Mac, Win+. on Windows)"
    ask "Avatar emoji" "$current_emoji"
    AVATAR="$ANSWER"
    if fields nickname "$NICKNAME" avatar_emoji "$AVATAR" member_id "$member_id" |
      cli family-check; then
      return 0
    fi
  done
}

# ask_role [current] -> ROLE
ask_role() {
  while true; do
    ask "Role (parent or child)" "${1-}"
    case "$(lower "$ANSWER")" in
      parent | p) ROLE=parent && return 0 ;;
      child | c) ROLE=child && return 0 ;;
      *) say "Type parent or child." ;;
    esac
  done
}

# Load the family into FAMILY_TZ and the M_* arrays; returns 1 when there is no family.
load_family() {
  local out kind a b c d
  out="$(cli family-show)"
  M_IDS=() M_ROLES=() M_EMOJIS=() M_NICKS=()
  if [ "$out" = none ]; then return 1; fi
  while IFS=$'\t' read -r kind a b c d; do
    case "$kind" in
      family) FAMILY_TZ="$b" ;;
      member) M_IDS+=("$a") M_ROLES+=("$b") M_EMOJIS+=("$c") M_NICKS+=("$d") ;;
    esac
  done <<<"$out"
}

print_members() {
  local i
  say "Timezone: $FAMILY_TZ"
  for ((i = 0; i < ${#M_IDS[@]}; i++)); do
    say "  $((i + 1)). ${M_EMOJIS[i]} ${M_NICKS[i]} (${M_ROLES[i]})"
  done
}

add_member() {
  heading "Add a family member"
  ask_identity
  ask_role
  ask_secret "$NICKNAME's 4-digit PIN" pin
  if ! fields nickname "$NICKNAME" avatar_emoji "$AVATAR" role "$ROLE" pin "$SECRET" |
    cli member-add; then
    say "Nothing was added."
  fi
}

add_members_loop() {
  while true; do
    ask "Add another family member? (yes / exit)"
    case "$(lower "$ANSWER")" in
      yes | y) add_member ;;
      exit | e | no | n | quit | q) return 0 ;;
      *) say "Type yes or exit." ;;
    esac
  done
}

create_family() {
  local timezone passcode
  heading "Create the family"
  while true; do
    ask "Family timezone (days and weeks follow it)" "$DEFAULT_TIMEZONE"
    timezone="$ANSWER"
    if fields timezone "$timezone" | cli family-check; then break; fi
  done
  say "The family passcode unlocks the app on each device; the whole family shares it."
  ask_secret "Family passcode (6-128 characters)" passcode
  passcode="$SECRET"
  heading "First parent"
  ask_identity
  ask_secret "$NICKNAME's 4-digit PIN" pin
  if ! fields timezone "$timezone" passcode "$passcode" nickname "$NICKNAME" \
    avatar_emoji "$AVATAR" pin "$SECRET" | cli family-create; then
    say "The family wasn't created."
    exit 1
  fi
  add_members_loop
}

update_member() {
  local i="$1"
  heading "Update ${M_NICKS[i]}"
  say "Press Enter to keep what's in [brackets]."
  ask_identity "${M_IDS[i]}" "${M_NICKS[i]}" "${M_EMOJIS[i]}"
  ask_role "${M_ROLES[i]}"
  ask_secret "New 4-digit PIN (Enter to keep the current one)" pin optional
  if ! fields nickname "$NICKNAME" avatar_emoji "$AVATAR" role "$ROLE" pin "$SECRET" |
    cli member-update --member-id "${M_IDS[i]}"; then
    say "Nothing was changed."
  fi
}

update_family() {
  local count
  while true; do
    load_family || return 0
    count=${#M_IDS[@]}
    heading "Family members"
    print_members
    ask "Member number to update, 'a' to add a member, 'p' to change the family passcode, or 'exit'"
    case "$(lower "$ANSWER")" in
      exit | e | quit | q) return 0 ;;
      a) add_member ;;
      p)
        ask_secret "New family passcode (6-128 characters)" passcode
        fields passcode "$SECRET" | cli family-passcode || say "The passcode wasn't changed."
        ;;
      *)
        if [[ "$ANSWER" =~ $NUMBER_RE ]] && [ "$ANSWER" -ge 1 ] && [ "$ANSWER" -le "$count" ]; then
          update_member $((ANSWER - 1))
        else
          say "Type a number from 1 to $count, a, p or exit."
        fi
        ;;
    esac
  done
}

delete_and_recreate() {
  heading "Delete the family"
  say "This deletes the family and everything in it: members, PINs, habits, check-ins,"
  say "streaks, gems, prizes and claims. Every device is signed out. It can't be undone."
  if [ "${APP_ENV:-dev}" = prod ]; then say "APP_ENV=prod: this is the live family."; fi
  ask "Type delete to confirm"
  if [ "$ANSWER" != delete ]; then
    say "Kept the family; nothing changed."
    return 0
  fi
  cli family-delete --yes
  create_family
}

main() {
  load_env
  heading "Family Habit Tracker: family setup"
  say "Database: ${DATABASE_URL:-sqlite:///./family_habit_tracker.db} (APP_ENV=${APP_ENV:-dev})"
  if ! load_family; then
    create_family
  else
    say "A family already exists."
    print_members
    while true; do
      ask "Update it (u), delete it and start again (d), or quit (q)"
      case "$(lower "$ANSWER")" in
        u | update) update_family && break ;;
        d | delete) delete_and_recreate && break ;;
        q | quit | exit) break ;;
        *) say "Type u, d or q." ;;
      esac
    done
  fi
  say ""
  say "All done."
}

main "$@"
