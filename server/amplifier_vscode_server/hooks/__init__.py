"""Hook modules for bridging amplifier-core events to VSCode UX systems."""

from .streaming_bridge import register_streaming_hooks

__all__ = ["register_streaming_hooks"]
