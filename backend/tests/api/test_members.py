"""REQ-006 manage members, REQ-007 remove a member and all their data, REQ-022 family board."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    MEMBER_READ_FIELDS,
    MEMBERS,
    SESSION,
    SeededFamily,
    Seeder,
    act_as,
    claim,
    create_prize,
    csrf,
    d,
    decide,
    member_path,
    put_check_in,
    use_saver,
)


def _new_member(**overrides) -> dict:
    return {"nickname": "Zuzu", "avatar_emoji": "🦊", "role": "child", "pin": "8642", **overrides}


# ---- REQ-006: add and edit members ------------------------------------------------------


@pytest.mark.req("REQ-006")
def test_req_006_parent_adds_a_member_returns_201_with_allowed_fields_only(
    as_parent: TestClient,
) -> None:
    response = as_parent.post(MEMBERS, json=_new_member(), headers=csrf(as_parent))

    assert response.status_code == 201
    body = response.json()
    assert set(body) == MEMBER_READ_FIELDS
    assert body | {"id": None} == {
        "id": None,
        "nickname": "Zuzu",
        "avatar_emoji": "🦊",
        "role": "child",
        "gem_balance": 0,
        "gems_held": 0,
    }
    assert len(as_parent.get(MEMBERS).json()) == 5


@pytest.mark.req("REQ-006")
def test_req_006_new_member_can_unlock_with_their_pin(
    as_parent: TestClient, family: SeededFamily
) -> None:
    created = as_parent.post(MEMBERS, json=_new_member(), headers=csrf(as_parent)).json()
    zuzu = family["Mia"].__class__(created["id"], "Zuzu", "🦊", "child", "8642")

    assert act_as(as_parent, zuzu).status_code == 200


@pytest.mark.req("REQ-006")
@pytest.mark.parametrize(
    "extra",
    [
        {"birthdate": "2018-05-01"},
        {"email": "kid@example.com"},
        {"age": 8},
        {"photo": "x.png"},
        {"location": "home"},
    ],
)
def test_req_006_extra_field_returns_422_and_stores_nothing(
    as_parent: TestClient, extra: dict
) -> None:
    response = as_parent.post(MEMBERS, json=_new_member(**extra), headers=csrf(as_parent))

    assert response.status_code == 422
    assert len(as_parent.get(MEMBERS).json()) == 4


@pytest.mark.req("REQ-006")
@pytest.mark.parametrize("nickname", ["Mia", "mia", " Mia "])
def test_req_006_duplicate_nickname_returns_422(as_parent: TestClient, nickname: str) -> None:
    response = as_parent.post(MEMBERS, json=_new_member(nickname=nickname), headers=csrf(as_parent))

    assert response.status_code == 422
    assert "detail" in response.json()


@pytest.mark.req("REQ-006")
@pytest.mark.parametrize(
    "field",
    [
        {"nickname": ""},
        {"nickname": "x" * 21},
        {"avatar_emoji": "fox"},
        {"avatar_emoji": "🦊🦊"},
        {"role": "admin"},
        {"pin": "12a4"},
    ],
)
def test_req_006_invalid_member_returns_422(as_parent: TestClient, field: dict) -> None:
    response = as_parent.post(MEMBERS, json=_new_member(**field), headers=csrf(as_parent))

    assert response.status_code == 422


@pytest.mark.req("REQ-006")
def test_req_006_child_cannot_add_a_member_returns_403(as_child: TestClient) -> None:
    response = as_child.post(MEMBERS, json=_new_member(), headers=csrf(as_child))

    assert response.status_code == 403
    assert len(as_child.get(MEMBERS).json()) == 4


@pytest.mark.req("REQ-006")
def test_req_006_member_edits_own_nickname_and_avatar(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.patch(
        member_path(family["Mia"]),
        json={"nickname": "Zuzu", "avatar_emoji": "🦄"},
        headers=csrf(as_child),
    )

    assert response.status_code == 200
    assert response.json()["nickname"] == "Zuzu"
    assert response.json()["avatar_emoji"] == "🦄"


@pytest.mark.req("REQ-006")
def test_req_006_child_cannot_edit_a_sibling_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.patch(
        member_path(family["Kavi"]), json={"avatar_emoji": "🦄"}, headers=csrf(as_child)
    )

    assert response.status_code == 403


@pytest.mark.req("REQ-006")
def test_req_006_parent_edits_a_child_and_changes_a_role(
    as_parent: TestClient, family: SeededFamily
) -> None:
    response = as_parent.patch(
        member_path(family["Kavi"]), json={"role": "parent"}, headers=csrf(as_parent)
    )

    assert response.status_code == 200
    assert response.json()["role"] == "parent"


@pytest.mark.req("REQ-006")
def test_req_006_child_cannot_change_a_role_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.patch(
        member_path(family["Mia"]), json={"role": "parent"}, headers=csrf(as_child)
    )

    assert response.status_code == 403
    assert as_child.get(member_path(family["Mia"])).json()["role"] == "child"


@pytest.mark.req("REQ-006")
def test_req_006_renaming_to_a_taken_nickname_returns_422(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.patch(
        member_path(family["Mia"]), json={"nickname": "KAVI"}, headers=csrf(as_child)
    )

    assert response.status_code == 422


@pytest.mark.req("REQ-006")
def test_req_006_demoting_the_last_parent_returns_422(
    as_parent: TestClient, family: SeededFamily
) -> None:
    demote_dad = as_parent.patch(
        member_path(family["Dad"]), json={"role": "child"}, headers=csrf(as_parent)
    )
    assert demote_dad.status_code == 200

    response = as_parent.patch(
        member_path(family["Mum"]), json={"role": "child"}, headers=csrf(as_parent)
    )

    assert response.status_code == 422
    assert "at least one parent" in response.json()["detail"]
    assert as_parent.get(member_path(family["Mum"])).json()["role"] == "parent"


@pytest.mark.req("REQ-006")
def test_req_006_edit_unknown_member_returns_404(as_parent: TestClient) -> None:
    response = as_parent.patch(
        f"{MEMBERS}/{uuid4()}", json={"avatar_emoji": "🦄"}, headers=csrf(as_parent)
    )

    assert response.status_code == 404


# ---- REQ-022: the family board reads with no acting member -----------------------------


@pytest.mark.req("REQ-022")
def test_req_022_members_listed_with_a_family_session_and_no_acting_member(
    unlocked: TestClient, family: SeededFamily
) -> None:
    response = unlocked.get(MEMBERS)

    assert response.status_code == 200
    assert {m["nickname"] for m in response.json()} == set(family.members)
    assert all(set(m) == MEMBER_READ_FIELDS for m in response.json())


@pytest.mark.req("REQ-022")
def test_req_022_get_one_member_and_unknown_returns_404(
    unlocked: TestClient, family: SeededFamily
) -> None:
    assert unlocked.get(member_path(family["Kavi"])).json()["nickname"] == "Kavi"
    assert unlocked.get(f"{MEMBERS}/{uuid4()}").status_code == 404


# ---- REQ-007: remove a member and everything about them ---------------------------------

OWNED_TABLES = {
    "check_in": "member_id",
    "habit": "member_id",
    "streak_saver": "member_id",
    "gem_transaction": "member_id",
    "prize_claim": "member_id",
    "member_credential": "member_id",
    "adjustment": "target_member_id",
}


def _give_mia_one_of_everything(as_parent: TestClient, family: SeededFamily, seed: Seeder):
    """Mia has a habit, check-ins, a saver, a claim, a PIN and adjustments; Mum acted on some."""
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=[d(-4), d(-3)])
    # Mum (a parent) acts on Mia's data, so Mum shows up in the actor columns.
    assert put_check_in(as_parent, habit, d(-10)).status_code == 201
    assert use_saver(as_parent, habit, d(-2)).status_code == 201
    prize_id = create_prize(as_parent, "Ice cream", 1).json()["id"]
    act_as(as_parent, mia)
    claim_id = claim(as_parent, prize_id).json()["id"]
    act_as(as_parent, family["Mum"])
    assert decide(as_parent, claim_id, "approved").status_code == 200
    return habit


@pytest.mark.req("REQ-007")
def test_req_007_removing_a_member_deletes_all_their_data_in_the_database(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    _give_mia_one_of_everything(as_parent, family, seed)
    for table, column in OWNED_TABLES.items():
        assert seed.count(table, f"{column} = ?", mia.id.hex) > 0, table

    response = as_parent.delete(member_path(mia), headers=csrf(as_parent))

    assert response.status_code == 204
    assert response.content == b""
    for table, column in OWNED_TABLES.items():
        assert seed.count(table, f"{column} = ?", mia.id.hex) == 0, table
    assert as_parent.get(member_path(mia)).status_code == 404


@pytest.mark.req("REQ-007")
def test_req_007_removed_members_check_ins_are_gone_from_the_api(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    seed.habit(mia, "Reading", done=[d(-3), d(-2), d(-1)])

    as_parent.delete(member_path(mia), headers=csrf(as_parent))

    check_ins = as_parent.get("/api/v1/check-ins", params={"from": d(-30), "to": d(0)})
    assert check_ins.json() == []
    assert as_parent.get("/api/v1/habits", params={"member_id": str(mia.id)}).json() == []


@pytest.mark.req("REQ-007")
def test_req_007_records_where_the_removed_member_only_acted_stay_with_actor_null(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mum, kavi = family["Mum"], family["Kavi"]
    habit = seed.habit(kavi, "Piano")
    assert put_check_in(as_parent, habit, d(-5)).status_code == 201  # Mum corrects Kavi's day
    act_as(as_parent, family["Dad"])

    assert as_parent.delete(member_path(mum), headers=csrf(as_parent)).status_code == 204

    assert seed.count("check_in", "member_id = ?", kavi.id.hex) == 1
    assert seed.count("check_in", "created_by_member_id IS NULL") == 1
    assert (
        seed.count("adjustment", "target_member_id = ? AND actor_member_id IS NULL", kavi.id.hex)
        == 1
    )


@pytest.mark.req("REQ-007")
def test_req_007_removing_the_last_parent_returns_422_and_deletes_nothing(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    assert as_parent.delete(member_path(family["Dad"]), headers=csrf(as_parent)).status_code == 204
    seed.habit(family["Mum"], "Swimming", done=[d(-1)])

    response = as_parent.delete(member_path(family["Mum"]), headers=csrf(as_parent))

    assert response.status_code == 422
    assert "at least one parent" in response.json()["detail"]
    assert seed.count("member", "id = ?", family["Mum"].id.hex) == 1
    assert seed.count("check_in", "member_id = ?", family["Mum"].id.hex) == 1


@pytest.mark.req("REQ-007")
def test_req_007_removing_an_unknown_member_returns_404(as_parent: TestClient) -> None:
    response = as_parent.delete(f"{MEMBERS}/{uuid4()}", headers=csrf(as_parent))

    assert response.status_code == 404


@pytest.mark.req("REQ-007")
def test_req_007_child_cannot_remove_a_member_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.delete(member_path(family["Kavi"]), headers=csrf(as_child))

    assert response.status_code == 403
    assert as_child.get(member_path(family["Kavi"])).status_code == 200


@pytest.mark.req("REQ-007")
def test_req_007_removing_the_acting_member_clears_them_from_the_device(
    as_parent: TestClient, family: SeededFamily
) -> None:
    response = as_parent.delete(member_path(family["Mum"]), headers=csrf(as_parent))

    assert response.status_code == 204
    assert as_parent.get(SESSION).json()["acting_member"] is None
