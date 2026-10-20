from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_is_only_served_under_api_v1_prefix(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_health_is_documented_in_openapi(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert "/api/v1/health" in paths
    assert "200" in paths["/api/v1/health"]["get"]["responses"]
