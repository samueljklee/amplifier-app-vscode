"""API routes for Amplifier VS Code Server."""

from fastapi import APIRouter

# Import routers from sub-modules
from .sessions import router as sessions_router
from .profiles import router as profiles_router

# Create main API router
router = APIRouter()

# Include sub-routers
router.include_router(sessions_router, tags=["sessions"])
router.include_router(profiles_router, tags=["profiles"])

__all__ = ["router"]
