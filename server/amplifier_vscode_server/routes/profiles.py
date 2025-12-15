"""Profile management routes."""

from pathlib import Path
from fastapi import APIRouter, HTTPException

from ..models import ProfileListResponse, ProfileSummary, ProfileDetail
from amplifier_profiles import ProfileLoader

router = APIRouter()

# Initialize profile loader with default search paths
_profile_loader: ProfileLoader | None = None


def _get_profile_loader() -> ProfileLoader:
    """Get or create profile loader."""
    global _profile_loader
    if _profile_loader is None:
        search_paths = [
            Path.home() / ".amplifier" / "profiles",
            Path(".amplifier") / "profiles",
        ]
        _profile_loader = ProfileLoader(search_paths=search_paths)
    return _profile_loader


@router.get("/profiles", response_model=ProfileListResponse)
async def list_profiles(collection: str | None = None) -> ProfileListResponse:
    """List all available profiles."""
    loader = _get_profile_loader()
    
    try:
        # Get all available profiles
        all_profiles = loader.list_profiles()
        
        # Filter by collection if specified
        if collection:
            all_profiles = [p for p in all_profiles if p.get("collection") == collection]
        
        # Convert to response models
        profiles = [
            ProfileSummary(
                name=p.get("name", "unknown"),
                collection=p.get("collection"),
                description=p.get("description", ""),
                extends=p.get("extends")
            )
            for p in all_profiles
        ]
        
        return ProfileListResponse(profiles=profiles)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "PROFILE_LIST_FAILED",
                    "message": f"Failed to list profiles: {str(e)}",
                    "details": {}
                }
            }
        )


@router.get("/profiles/{profile_name}", response_model=ProfileDetail)
async def get_profile(profile_name: str) -> ProfileDetail:
    """Get detailed information about a profile."""
    loader = _get_profile_loader()
    
    try:
        # Load the profile
        profile = loader.load_profile(profile_name)
        
        # Convert to response model
        return ProfileDetail(
            name=profile.get("name", profile_name),
            collection=profile.get("collection"),
            description=profile.get("description", ""),
            extends=profile.get("extends"),
            providers=profile.get("providers", []),
            tools=profile.get("tools", []),
            hooks=profile.get("hooks", []),
            agents=profile.get("agents", []),
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "PROFILE_NOT_FOUND",
                    "message": f"Profile '{profile_name}' not found",
                    "details": {"profile_name": profile_name}
                }
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "PROFILE_LOAD_FAILED",
                    "message": f"Failed to load profile: {str(e)}",
                    "details": {"profile_name": profile_name}
                }
            }
        )
