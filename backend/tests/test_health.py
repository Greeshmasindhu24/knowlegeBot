"""Health endpoint tests."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_health_endpoint_ok(client, mock_db_session):
    mock_result = AsyncMock()
    mock_db_session.execute.return_value = mock_result

    with patch("routers.health.get_vector_store") as mock_vs:
        mock_vs.return_value.health_check.return_value = True
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["version"] == "0.1.0"
    assert data["database"] == "ok"
    assert data["chroma"] == "ok"


@pytest.mark.asyncio
async def test_root_endpoint(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert "service" in response.json()
