"""System endpoints."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health() -> dict:
    """Liveness check for Docker and deployment platforms."""
    return {"status": "ok"}
