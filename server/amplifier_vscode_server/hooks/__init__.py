"""Hook modules for bridging amplifier-core events to VSCode UX systems."""

from .streaming_bridge import register_streaming_hooks
from .approval_hook import register_approval_hook

__all__ = ["register_streaming_hooks", "register_approval_hook"]
