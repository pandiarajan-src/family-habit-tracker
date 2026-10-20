"""Server-side commands: `uv run python -m app.cli setup-family | seed-dev`.

Family creation is not an HTTP endpoint, so passcode entry stays the only unauthenticated
route [child-data-privacy #3]. Secrets are prompted without echo, so they stay out of shell
history, and are never printed or logged.
"""

import argparse
import getpass
import re
import sys
from zoneinfo import available_timezones

from sqlmodel import Session, select

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
    passcode = _ask_secret(
        "Family passcode",
        lambda v: len(v) >= MIN_PASSCODE_LENGTH,
        f"Use at least {MIN_PASSCODE_LENGTH} characters.",
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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("setup-family", help="Create the family and its first parent")
    setup.add_argument("--timezone", default="Europe/London", help="IANA timezone name")
    commands.add_parser("seed-dev", help="Create the sample family in a dev database")
    commands.add_parser("migrate", help="Apply database migrations")
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    match args.command:
        case "setup-family":
            setup_family(settings, args.timezone)
        case "seed-dev":
            seed_dev(settings)
        case "migrate":
            upgrade_to_head(settings.database_url)


if __name__ == "__main__":
    main()
