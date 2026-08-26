"""System endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.llm.mock import mock_enabled

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health() -> dict:
    """Liveness check for Docker and deployment platforms.

    `llm_mock` lets a caller tell a disposable test instance from a real one.
    The E2E suite refuses to run against `llm_mock: false`, because its chat
    specs would spend real Groq quota and trade against a real portfolio.
    """
    return {"status": "ok", "llm_mock": mock_enabled()}
