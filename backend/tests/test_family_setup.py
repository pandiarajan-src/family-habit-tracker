"""`scripts/family-setup.sh` and the `family-*` / `member-*` CLI commands behind it."""

import io
import os
import subprocess
import sys
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlmodel import Session, select

from app import cli
from app import family_admin as admin
from app.clock import SystemClock
from app.config import Settings
from app.db import make_engine, upgrade_to_head
from app.models import DeviceSession, Family, Habit, Member, MemberCredential, Role
from app.security.hashing import verify_secret

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "family-setup.sh"
MUM = admin.MemberDetails(nickname="Mum", avatar_emoji="🌻", role=Role.parent, pin="2468")
MIA = admin.MemberDetails(nickname="Mia", avatar_emoji="🐬", role=Role.child, pin="3579")


@pytest.fixture
def env(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("DATABASE_URL", settings.database_url)
    upgrade_to_head(settings.database_url)
    return settings


@pytest.fixture
def db(env: Settings) -> Iterator[Session]:
    engine = make_engine(env.database_url)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _family(db: Session) -> Family:
    return admin.create_family(db, "Europe/London", "owl-sunflower-26", MUM)


def _run(argv: list[str], stdin: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    cli.main(argv)


def _fail(argv: list[str], stdin: str, monkeypatch: pytest.MonkeyPatch, capsys) -> str:
    with pytest.raises(SystemExit) as exit_info:
        _run(argv, stdin, monkeypatch)
    assert exit_info.value.code == 2
    return capsys.readouterr().err


# ---- family_admin rules ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("check", "value", "message"),
    [
        (admin.check_nickname, "", "1-20 characters"),
        (admin.check_nickname, "A" * 21, "1-20 characters"),
        (admin.check_nickname, "Mi\ta", "control characters"),
        (admin.check_emoji, "Mia", "exactly one emoji"),
        (admin.check_emoji, "🐬🐬", "exactly one emoji"),
        (admin.check_role, "grandma", "parent or child"),
        (admin.check_pin, "12a4", "exactly 4 numbers"),
        (admin.check_pin, "12345", "exactly 4 numbers"),
        (admin.check_passcode, "short", "6-128 characters"),
        (admin.check_passcode, "x" * 129, "6-128 characters"),
        (admin.check_timezone, "Mars/Olympus_Mons", "Unknown timezone"),
    ],
)
def test_checks_refuse_values_the_app_would_refuse(check, value, message) -> None:
    with pytest.raises(admin.AdminError, match=message):
        check(value)


def test_checks_tidy_valid_values() -> None:
    assert admin.check_nickname("  Mia ") == "Mia"
    assert admin.check_emoji(" 👨‍👩‍👧 ") == "👨‍👩‍👧"
    assert admin.check_role(" Parent ") is Role.parent
    assert admin.check_timezone("Asia/Kolkata") == "Asia/Kolkata"
    assert admin.check_passcode(" spaced passcode ") == " spaced passcode "


def test_create_family_stores_only_hashes_and_refuses_a_second(db: Session) -> None:
    family = _family(db)

    [mum] = admin.list_members(db, family)
    credential = db.get(MemberCredential, mum.id)
    assert verify_secret(family.passcode_hash, "owl-sunflower-26")
    assert credential is not None and verify_secret(credential.pin_hash, "2468")
    with pytest.raises(admin.AdminError, match="already exists"):
        _family(db)


def test_the_first_member_must_be_a_parent(db: Session) -> None:
    with pytest.raises(admin.AdminError, match="must be a parent"):
        admin.create_family(db, "Europe/London", "owl-sunflower-26", MIA)
    assert admin.get_family(db) is None


def test_add_member_refuses_a_nickname_already_used_ignoring_case(db: Session) -> None:
    family = _family(db)
    admin.add_member(db, family, MIA)

    with pytest.raises(admin.AdminError, match="already has that nickname"):
        admin.add_member(db, family, admin.MemberDetails("mia", "🦖", Role.child, "1111"))


def test_update_member_changes_only_what_is_given_and_clears_a_lockout(db: Session) -> None:
    family = _family(db)
    mia = admin.add_member(db, family, MIA)
    credential = db.get(MemberCredential, mia.id)
    assert credential is not None
    credential.failed_attempts = 5
    credential.locked_until = SystemClock().now() + timedelta(minutes=5)
    db.add(credential)
    db.commit()

    updated = admin.update_member(db, family, mia.id, nickname="Mimi", pin="1111")

    db.refresh(credential)
    assert (updated.nickname, updated.avatar_emoji, updated.role) == ("Mimi", "🐬", Role.child)
    assert verify_secret(credential.pin_hash, "1111")
    assert (credential.failed_attempts, credential.locked_until) == (0, None)


def test_update_member_keeps_its_own_nickname_and_changes_avatar_and_role(db: Session) -> None:
    family = _family(db)
    mia = admin.add_member(db, family, MIA)

    updated = admin.update_member(
        db, family, mia.id, nickname="Mia", avatar_emoji="🦄", role=Role.parent
    )

    assert (updated.nickname, updated.avatar_emoji, updated.role) == ("Mia", "🦄", Role.parent)


def test_update_member_gives_a_member_without_a_credential_a_pin(db: Session) -> None:
    family = _family(db)
    mia = admin.add_member(db, family, MIA)
    db.delete(db.get(MemberCredential, mia.id))
    db.commit()

    admin.update_member(db, family, mia.id, pin="4321")

    credential = db.get(MemberCredential, mia.id)
    assert credential is not None and verify_secret(credential.pin_hash, "4321")


def test_update_member_keeps_at_least_one_parent(db: Session) -> None:
    family = _family(db)
    [mum] = admin.list_members(db, family)

    with pytest.raises(admin.AdminError, match="at least one parent"):
        admin.update_member(db, family, mum.id, role=Role.child)

    admin.add_member(db, family, admin.MemberDetails("Dad", "🦉", Role.parent, "1357"))
    assert admin.update_member(db, family, mum.id, role=Role.child).role is Role.child


def test_update_member_refuses_an_unknown_member(db: Session) -> None:
    family = _family(db)

    with pytest.raises(admin.AdminError, match="No member"):
        admin.update_member(db, family, uuid4(), nickname="X")


def test_change_passcode_signs_every_device_out(db: Session) -> None:
    family = _family(db)
    now = SystemClock().now()
    db.add(
        DeviceSession(
            id="token-hash",
            family_id=family.id,
            last_activity_at=now,
            expires_at=now + timedelta(minutes=5),
        )
    )
    db.commit()

    admin.change_passcode(db, family, "brand-new-pass")

    db.refresh(family)
    assert verify_secret(family.passcode_hash, "brand-new-pass")
    assert db.exec(select(DeviceSession)).all() == []


def test_delete_family_cascades_to_everything_in_it(db: Session) -> None:
    family = _family(db)
    mia = admin.add_member(db, family, MIA)
    db.add(
        Habit(
            family_id=family.id,
            member_id=mia.id,
            title="Reading",
            frequency="daily",
            created_on=SystemClock().now().date(),
        )
    )
    db.commit()

    assert admin.delete_family(db) == 1

    for table in (Family, Member, MemberCredential, Habit):
        assert db.exec(select(table)).all() == []
    assert admin.delete_family(db) == 0


# ---- CLI commands (stdin key=value lines) ----------------------------------------------


def test_cli_family_show_prints_none_then_the_members(
    env: Settings, db: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    cli.main(["family-show"])
    assert capsys.readouterr().out == "none\n"

    family = _family(db)
    [mum] = admin.list_members(db, family)
    cli.main(["family-show"])

    assert capsys.readouterr().out.splitlines() == [
        f"family\t{family.id}\tEurope/London",
        f"member\t{mum.id}\tparent\t🌻\tMum",
    ]


def test_cli_family_create_then_member_add_and_update(
    env: Settings,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _run(
        ["family-create"],
        "timezone=Asia/Kolkata\npasscode= with spaces \nnickname=Mum\navatar_emoji=🌻\npin=2468\n",
        monkeypatch,
    )
    _run(["member-add"], "nickname=Mia\navatar_emoji=🐬\nrole=child\npin=3579\n", monkeypatch)
    mia = db.exec(select(Member).where(Member.nickname == "Mia")).one()
    _run(
        ["member-update", "--member-id", str(mia.id)],
        "nickname=Mimi\navatar_emoji=\nrole=child\npin=\n",
        monkeypatch,
    )

    db.rollback()  # end the read snapshot taken before the commands ran
    family = db.exec(select(Family)).one()
    db.refresh(mia)
    assert family.timezone == "Asia/Kolkata"
    assert verify_secret(family.passcode_hash, " with spaces ")
    assert (mia.nickname, mia.avatar_emoji) == ("Mimi", "🐬")
    out = capsys.readouterr().out
    assert "Family created:" in out and "Added Mia (child)." in out and "Updated Mimi." in out
    assert "2468" not in out and "with spaces" not in out


def test_cli_family_passcode_and_delete(
    env: Settings,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _family(db)
    _run(["family-passcode"], "passcode=brand-new-pass\n", monkeypatch)
    cli.main(["family-delete", "--yes"])

    assert db.exec(select(Family)).all() == []
    out = capsys.readouterr().out
    assert "every device needs the new one" in out and "Deleted 1 family" in out
    cli.main(["family-delete", "--yes"])
    assert "There was no family." in capsys.readouterr().out


def test_cli_family_check_validates_what_is_given(
    env: Settings,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _run(["family-check"], "timezone=Europe/London\nnickname=Mum\navatar_emoji=🌻\n", monkeypatch)
    family = _family(db)
    [mum] = admin.list_members(db, family)
    # Keeping your own nickname is fine; taking someone else's isn't.
    _run(["family-check"], f"nickname=mum\nmember_id={mum.id}\n", monkeypatch)
    _run(["family-check"], "nickname=Mia\nmember_id=\n", monkeypatch)

    assert "already has that nickname" in _fail(
        ["family-check"], "nickname=MUM\n", monkeypatch, capsys
    )
    assert "exactly one emoji" in _fail(["family-check"], "avatar_emoji=:)\n", monkeypatch, capsys)
    assert "Unknown timezone" in _fail(["family-check"], "timezone=Nowhere\n", monkeypatch, capsys)


@pytest.mark.parametrize(
    ("argv", "stdin", "message"),
    [
        (["family-delete"], "", "needs --yes"),
        (["member-add"], "nickname=Mia\n", "Missing on stdin: avatar_emoji, pin"),
        (["member-add"], "nickname=Mia\navatar_emoji=🐬\npin=3579\n", "Missing on stdin: role"),
        (["member-add"], "garbage\n", "key=value"),
        (["member-add"], "nickname=Mia\navatar_emoji=🐬\nrole=child\npin=1\n", "4 numbers"),
        (["family-passcode"], "passcode=brand-new-pass\n", "no family yet"),
        (["member-update", "--member-id", "not-a-uuid"], "nickname=X\n", "No member"),
    ],
)
def test_cli_admin_commands_explain_what_is_wrong(
    env: Settings,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    argv: list[str],
    stdin: str,
    message: str,
) -> None:
    assert message in _fail(argv, stdin, monkeypatch, capsys)


# ---- the shell script, end to end ------------------------------------------------------


def _script(env: Settings, answers: list[str]) -> subprocess.CompletedProcess[str]:
    """Run the script with typed answers; FAMILY_CLI uses this interpreter (no uv)."""
    environment = {
        "PATH": os.environ["PATH"],
        "LANG": "en_US.UTF-8",
        "APP_ENV": "dev",
        "DATABASE_URL": env.database_url,
        "FAMILY_CLI": f"{sys.executable} -m app.cli",
    }
    return subprocess.run(  # noqa: S603 - our own script, fixed arguments
        ["/bin/bash", str(SCRIPT)],
        input="\n".join(answers) + "\n",
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


@pytest.mark.skipif(not SCRIPT.exists(), reason="scripts/family-setup.sh not in this checkout")
def test_script_creates_the_family_and_adds_members_until_exit(env: Settings, db: Session) -> None:
    result = _script(
        env,
        [
            "",  # timezone: keep Europe/London
            "short",  # passcode too short: asked again
            "owl-sunflower-26",
            "owl-sunflower-26",
            "Mum",
            "Mum",  # not an emoji: nickname and avatar asked again
            "Mum",
            "🌻",
            "2468",
            "2469",  # confirmation differs: asked again
            "2468",
            "2468",
            "maybe",  # not yes/exit: asked again
            "yes",
            "Mia",
            "🐬",
            "kid",  # not a role: asked again
            "child",
            "3579",
            "3579",
            "exit",
        ],
    )

    assert result.returncode == 0, result.stderr
    family = db.exec(select(Family)).one()
    members = {m.nickname: m for m in db.exec(select(Member)).all()}
    assert set(members) == {"Mum", "Mia"} and members["Mia"].role is Role.child
    assert verify_secret(family.passcode_hash, "owl-sunflower-26")
    mia_pin = db.get(MemberCredential, members["Mia"].id)
    assert mia_pin is not None and verify_secret(mia_pin.pin_hash, "3579")
    for hint in (
        "6-128 characters",
        "exactly one emoji",
        "don't match yet",
        "Type yes or exit.",
        "parent or child",
        "All done.",
    ):
        assert hint in result.stderr
    assert "owl-sunflower-26" not in result.stdout + result.stderr
    assert "2468" not in result.stdout + result.stderr


@pytest.mark.skipif(not SCRIPT.exists(), reason="scripts/family-setup.sh not in this checkout")
def test_script_updates_an_existing_family(env: Settings, db: Session) -> None:
    family = _family(db)
    mia = admin.add_member(db, family, MIA)

    result = _script(
        env,
        [
            "u",
            "7",  # not on the list: asked again
            "2",  # Mia
            "Mimi",
            "",  # keep 🐬
            "",  # keep child
            "1111",
            "1111",
            "1",  # Mum: demoting the only parent is refused
            "",
            "",
            "child",
            "",
            "a",
            "Dad",
            "🦉",
            "parent",
            "1357",
            "1357",
            "p",
            "brand-new-pass",
            "brand-new-pass",
            "exit",
        ],
    )

    assert result.returncode == 0, result.stderr
    db.rollback()  # end the read snapshot taken before the script ran
    members = {m.nickname: m for m in db.exec(select(Member)).all()}
    assert set(members) == {"Mum", "Mimi", "Dad"}
    assert members["Mimi"].id == mia.id and members["Mum"].role is Role.parent
    mimi_pin = db.get(MemberCredential, mia.id)
    assert mimi_pin is not None and verify_secret(mimi_pin.pin_hash, "1111")
    assert verify_secret(db.exec(select(Family)).one().passcode_hash, "brand-new-pass")
    assert "at least one parent" in result.stderr
    assert "Type a number from 1 to 2" in result.stderr


@pytest.mark.skipif(not SCRIPT.exists(), reason="scripts/family-setup.sh not in this checkout")
def test_script_deletes_the_family_only_when_confirmed_then_creates_a_new_one(
    env: Settings, db: Session
) -> None:
    _family(db)

    kept = _script(env, ["d", "no", "q"])
    assert kept.returncode == 0 and "Kept the family" in kept.stderr
    assert len(db.exec(select(Member)).all()) == 1

    result = _script(
        env,
        [
            *["d", "delete", "Asia/Kolkata", "new-family-pass", "new-family-pass"],
            *["Papa", "🐻", "9876", "9876", "exit"],
        ],
    )

    assert result.returncode == 0, result.stderr
    db.rollback()  # end the read snapshot taken before the script ran
    family = db.exec(select(Family)).one()
    [papa] = db.exec(select(Member)).all()
    assert family.timezone == "Asia/Kolkata"
    assert (papa.nickname, papa.role) == ("Papa", Role.parent)
    assert "Deleted 1 family" in result.stdout


@pytest.mark.skipif(not SCRIPT.exists(), reason="scripts/family-setup.sh not in this checkout")
def test_script_stops_cleanly_when_input_ends(env: Settings) -> None:
    result = _script(env, [""])  # timezone, then end of input at the passcode

    assert result.returncode == 1
    assert "Stopped." in result.stderr
