"""Server-side commands: `uv run python -m app.cli setup-family | seed-dev | migrate`.

The `family-*` and `member-*` commands back `scripts/family-setup.sh`: they read
`key=value` lines on stdin (so passcodes and PINs never appear in `ps` or shell history),
print tab-separated results, and exit 2 with a message on stderr when a rule is broken.

Family creation is not an HTTP endpoint, so passcode entry stays the only unauthenticated
route [child-data-privacy #3]. Secrets are prompted without echo, so they stay out of shell
history, and are never printed or logged.
"""

import argparse
import getpass
import re
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TextIO
from uuid import UUID
from zoneinfo import available_timezones

from sqlmodel import Session, select

from app import family_admin as admin
from app.clock import SystemClock
from app.config import Settings
from app.db import make_engine, upgrade_to_head
from app.models import Family, Member, MemberCredential, Role
from app.security.hashing import hash_secret

PIN_PATTERN = re.compile(r"^[0-9]{4}$")
MIN_PASSCODE_LENGTH = 6

# Dev-only sample family; matches the test fixtures (REQ-020, not the mockup data).
DEV_PASSCODE = "owl-sunflower-26"
DEV_MEMBERS = (
    ("Dad", "🦉", Role.parent, "1357"),
    ("Mum", "🌻", Role.parent, "2468"),
    ("Mia", "🐬", Role.child, "3579"),
    ("Kavi", "🦖", Role.child, "4680"),
)


def create_family(
    db: Session,
    passcode: str,
    timezone: str,
    members: list[tuple[str, str, Role, str]],
) -> Family:
    now = SystemClock().now()
    family = Family(timezone=timezone, passcode_hash=hash_secret(passcode), created_at=now)
    db.add(family)
    db.flush()
    for nickname, avatar_emoji, role, pin in members:
        member = Member(
            family_id=family.id,
            nickname=nickname,
            avatar_emoji=avatar_emoji,
            role=role,
            created_at=now,
        )
        db.add(member)
        db.flush()
        db.add(MemberCredential(member_id=member.id, pin_hash=hash_secret(pin)))
    db.commit()
    return family


def _ask_secret(prompt: str, valid, rule: str) -> str:
    while True:
        value = getpass.getpass(f"{prompt}: ")
        if not valid(value):
            print(rule)
        elif getpass.getpass(f"{prompt} again: ") != value:
            print("Those don't match yet, try again.")
        else:
            return value


def setup_family(settings: Settings, timezone: str) -> None:
    if timezone not in available_timezones():
        sys.exit(f"Unknown timezone {timezone!r}; use an IANA name such as Europe/London.")
    nickname = input("First parent's nickname (1-20 characters): ").strip()
    if not 1 <= len(nickname) <= 20:
        sys.exit("A nickname is 1-20 characters.")
    avatar = input("Their avatar emoji: ").strip()
    # Hints are literals: nothing printed here is built from a secret or secret-named value
    # (CodeQL py/clear-text-logging-sensitive-data). test_cli checks the "6" matches the rule.
    passcode = _ask_secret(
        "Family passcode",
        lambda v: len(v) >= MIN_PASSCODE_LENGTH,
        "Use at least 6 characters.",
    )
    pin = _ask_secret("Their 4-digit PIN", PIN_PATTERN.match, "A PIN is exactly 4 numbers.")

    upgrade_to_head(settings.database_url)
    engine = make_engine(settings.database_url)
    with Session(engine) as db:
        family = create_family(db, passcode, timezone, [(nickname, avatar, Role.parent, pin)])
        print(f"Family created: {family.id}")
    engine.dispose()


def seed_dev(settings: Settings) -> None:
    if settings.app_env == "prod":
        sys.exit("seed-dev refuses to run with APP_ENV=prod.")
    upgrade_to_head(settings.database_url)
    engine = make_engine(settings.database_url)
    with Session(engine) as db:
        if db.exec(select(Family)).first() is not None:
            print("seed-dev: database already has a family; nothing to do.")
        else:
            create_family(db, DEV_PASSCODE, "Europe/London", list(DEV_MEMBERS))
            print("seed-dev: sample family created (passcode and PINs: see app/cli.py).")
    engine.dispose()


@contextmanager
def _session(settings: Settings) -> Iterator[Session]:
    upgrade_to_head(settings.database_url)
    engine = make_engine(settings.database_url)
    try:
        with Session(engine) as db:
            yield db
    finally:
        engine.dispose()


def _read_fields(stream: TextIO) -> dict[str, str]:
    """`key=value` lines; values are kept exactly (a passcode may start with a space)."""
    fields: dict[str, str] = {}
    for line in stream.read().splitlines():
        if not line:
            continue
        key, sep, value = line.partition("=")
        if not sep:
            raise admin.AdminError("Expected key=value lines on stdin.")
        fields[key.strip()] = value
    return fields


def _require(fields: dict[str, str], *keys: str) -> list[str]:
    missing = [key for key in keys if key not in fields]
    if missing:
        raise admin.AdminError(f"Missing on stdin: {', '.join(missing)}.")
    return [fields[key] for key in keys]


def _require_family(db: Session) -> Family:
    family = admin.get_family(db)
    if family is None:
        raise admin.AdminError("There is no family yet; create one first.")
    return family


def _member_details(fields: dict[str, str], role: str | None = None) -> admin.MemberDetails:
    nickname, avatar, pin = _require(fields, "nickname", "avatar_emoji", "pin")
    return admin.MemberDetails(
        nickname=admin.check_nickname(nickname),
        avatar_emoji=admin.check_emoji(avatar),
        role=admin.check_role(role if role is not None else _require(fields, "role")[0]),
        pin=admin.check_pin(pin),
    )


def family_show(settings: Settings) -> None:
    """`none`, or a `family` line then one `member` line per member (tab-separated)."""
    with _session(settings) as db:
        family = admin.get_family(db)
        if family is None:
            print("none")
            return
        print(f"family\t{family.id}\t{family.timezone}")
        for m in admin.list_members(db, family):
            print(f"member\t{m.id}\t{m.role.value}\t{m.avatar_emoji}\t{m.nickname}")


def family_check(settings: Settings, fields: dict[str, str]) -> None:
    """Validate whichever of nickname, avatar_emoji, timezone are given, before asking for a PIN."""
    if "timezone" in fields:
        admin.check_timezone(fields["timezone"])
    if "avatar_emoji" in fields:
        admin.check_emoji(fields["avatar_emoji"])
    if "nickname" in fields:
        nickname = admin.check_nickname(fields["nickname"])
        with _session(settings) as db:
            family = admin.get_family(db)
            if family is not None:
                member_id = UUID(fields["member_id"]) if fields.get("member_id") else None
                admin.check_nickname_free(db, family, nickname, member_id)


def family_create(settings: Settings, fields: dict[str, str]) -> None:
    timezone, passcode = _require(fields, "timezone", "passcode")
    details = _member_details(fields, role="parent")
    with _session(settings) as db:
        family = admin.create_family(db, timezone, passcode, details)
        print(f"Family created: {family.id}")


def family_delete(settings: Settings, confirmed: bool) -> None:
    if not confirmed:
        raise admin.AdminError("Deleting the family needs --yes.")
    with _session(settings) as db:
        count = admin.delete_family(db)
    print(f"Deleted {count} family and everything in it." if count else "There was no family.")


def family_passcode(settings: Settings, fields: dict[str, str]) -> None:
    (passcode,) = _require(fields, "passcode")
    with _session(settings) as db:
        admin.change_passcode(db, _require_family(db), passcode)
    print("Family passcode changed; every device needs the new one.")


def member_add(settings: Settings, fields: dict[str, str]) -> None:
    details = _member_details(fields)
    with _session(settings) as db:
        member = admin.add_member(db, _require_family(db), details)
        print(f"Added {member.nickname} ({member.role.value}).")


def member_update(settings: Settings, member_id: str, fields: dict[str, str]) -> None:
    """Only the keys given change; an empty value also means "keep"."""
    given = {key: value for key, value in fields.items() if value != ""}
    try:
        member_uuid = UUID(member_id)
    except ValueError:
        raise admin.AdminError("No member with that id in this family.") from None
    nickname = admin.check_nickname(given["nickname"]) if "nickname" in given else None
    avatar = admin.check_emoji(given["avatar_emoji"]) if "avatar_emoji" in given else None
    role = admin.check_role(given["role"]) if "role" in given else None
    pin = admin.check_pin(given["pin"]) if "pin" in given else None
    with _session(settings) as db:
        member = admin.update_member(
            db,
            _require_family(db),
            member_uuid,
            nickname=nickname,
            avatar_emoji=avatar,
            role=role,
            pin=pin,
        )
        print(f"Updated {member.nickname}.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("setup-family", help="Create the family and its first parent")
    setup.add_argument("--timezone", default="Europe/London", help="IANA timezone name")
    commands.add_parser("seed-dev", help="Create the sample family in a dev database")
    commands.add_parser("migrate", help="Apply database migrations")
    commands.add_parser("family-show", help="Print the family and its members (tab-separated)")
    commands.add_parser("family-check", help="Validate nickname/avatar_emoji/timezone (stdin)")
    commands.add_parser("family-create", help="Create the family and first parent (stdin)")
    delete_cmd = commands.add_parser("family-delete", help="Delete the family and all its data")
    delete_cmd.add_argument("--yes", action="store_true", help="Confirm the deletion")
    commands.add_parser("family-passcode", help="Change the family passcode (stdin)")
    commands.add_parser("member-add", help="Add a family member (stdin)")
    update_cmd = commands.add_parser("member-update", help="Change a member's details (stdin)")
    update_cmd.add_argument("--member-id", required=True)
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    match args.command:
        case "setup-family":
            setup_family(settings, args.timezone)
        case "seed-dev":
            seed_dev(settings)
        case "migrate":
            upgrade_to_head(settings.database_url)
        case _:
            _run_admin(settings, args)


def _run_admin(settings: Settings, args: argparse.Namespace) -> None:
    try:
        match args.command:
            case "family-show":
                family_show(settings)
            case "family-check":
                family_check(settings, _read_fields(sys.stdin))
            case "family-create":
                family_create(settings, _read_fields(sys.stdin))
            case "family-delete":
                family_delete(settings, args.yes)
            case "family-passcode":
                family_passcode(settings, _read_fields(sys.stdin))
            case "member-add":
                member_add(settings, _read_fields(sys.stdin))
            case "member-update":
                member_update(settings, args.member_id, _read_fields(sys.stdin))
    except admin.AdminError as error:
        print(error, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
