"""Bundle management routes."""

import re
from pathlib import Path
from fastapi import APIRouter, HTTPException

from ..models import ProfileListResponse, ProfileSummary, ProfileDetail

router = APIRouter()

# Security: Pattern for valid bundle names
VALID_BUNDLE_NAME = re.compile(r'^[a-zA-Z0-9_-]+$')


def _get_local_bundles() -> list[dict]:
    """Get list of locally available bundles."""
    bundles = []
    
    # Local vscode bundles
    local_path = Path(__file__).parent.parent / "data" / "collections" / "vscode" / "bundles"
    if local_path.exists():
        for f in local_path.glob("*.md"):
            # Security: Only include files with valid names
            if VALID_BUNDLE_NAME.match(f.stem):
                bundles.append({
                    "name": f.stem,
                    "collection": "vscode",
                    "path": str(f),
                })
    
    # User bundles
    user_path = Path.home() / ".amplifier" / "bundles"
    if user_path.exists():
        for f in user_path.glob("*.md"):
            # Security: Only include files with valid names
            if VALID_BUNDLE_NAME.match(f.stem):
                bundles.append({
                    "name": f.stem,
                    "collection": "user",
                    "path": str(f),
                })
    
    return bundles


def _parse_bundle_frontmatter(path: Path) -> dict:
    """Parse bundle frontmatter from markdown file."""
    import yaml
    
    content = path.read_text()
    if not content.startswith("---"):
        return {}
    
    # Find end of frontmatter
    end = content.find("---", 3)
    if end == -1:
        return {}
    
    frontmatter = content[3:end].strip()
    try:
        return yaml.safe_load(frontmatter) or {}
    except Exception:
        return {}


@router.get("/profiles", response_model=ProfileListResponse)
async def list_profiles(collection: str | None = None) -> ProfileListResponse:
    """List all available profiles/bundles."""
    try:
        all_bundles = _get_local_bundles()
        
        # Filter by collection if specified
        if collection:
            all_bundles = [b for b in all_bundles if b.get("collection") == collection]
        
        # Parse each bundle for metadata
        profiles = []
        for bundle_info in all_bundles:
            path = Path(bundle_info["path"])
            data = _parse_bundle_frontmatter(path)
            bundle_meta = data.get("bundle", data.get("profile", {}))
            
            profiles.append(ProfileSummary(
                name=bundle_info["name"],
                collection=bundle_info.get("collection"),
                description=bundle_meta.get("description", ""),
                extends=None
            ))
        
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
    """Get detailed information about a profile/bundle."""
    try:
        # Find the bundle
        all_bundles = _get_local_bundles()
        bundle_info = next((b for b in all_bundles if b["name"] == profile_name), None)
        
        if not bundle_info:
            raise FileNotFoundError(f"Bundle {profile_name} not found")
        
        # Parse the bundle
        path = Path(bundle_info["path"])
        data = _parse_bundle_frontmatter(path)
        bundle_meta = data.get("bundle", data.get("profile", {}))
        
        return ProfileDetail(
            name=profile_name,
            collection=bundle_info.get("collection"),
            description=bundle_meta.get("description", ""),
            extends=None,
            providers=data.get("providers", []),
            tools=data.get("tools", []),
            hooks=data.get("hooks", []),
            agents=list(data.get("agents", {}).keys()) if isinstance(data.get("agents"), dict) else [],
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
