"""
Workspace Sandbox Hook

Ensures filesystem-aware tools (bash, write_file, edit_file, search) execute
within the VS Code workspace root by patching tool configs just before they run.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

from amplifier_core import HookResult
from amplifier_core.events import TOOL_PRE

from .utils import ensure_tool_input

if TYPE_CHECKING:
    from amplifier_core import ModuleCoordinator

logger = logging.getLogger(__name__)


def _normalize_path(workspace_root: str, candidate: str | None) -> str | None:
    if not candidate:
        return None

    if os.path.isabs(candidate):
        return candidate

    return str(Path(workspace_root) / candidate)


def register_workspace_hook(
    coordinator: "ModuleCoordinator",
    workspace_root: str,
) -> callable:
    """
    Register a hook that enforces the workspace root for destructive tools.
    """
    hooks = coordinator.hooks

    async def workspace_sandbox_hook(event: str, data: dict[str, Any]) -> HookResult:
        if event != TOOL_PRE:
            return HookResult(action="continue")

        tool_name = data.get("tool_name")
        tool_input = ensure_tool_input(data)
        tool_config = data.setdefault("config", {})

        if not workspace_root:
            return HookResult(action="continue")

        if tool_name == "bash":
            tool_config["working_dir"] = workspace_root
            cmd = tool_input.get("command")
            if cmd:
                tool_input["command"] = f"cd '{workspace_root}' && {cmd}"
            logger.info(f"[WORKSPACE SANDBOX] Enforced bash working_dir -> {workspace_root}")

        if tool_name == "search":
            tool_config["working_dir"] = workspace_root
            logger.info(f"[WORKSPACE SANDBOX] Enforced search working_dir -> {workspace_root}")

        if tool_name in {"write_file", "edit_file", "read_file"}:
            tool_config["working_dir"] = workspace_root
            tool_config["allowed_write_paths"] = [workspace_root]
            file_path = _normalize_path(workspace_root, tool_input.get("file_path"))
            if file_path:
                tool_input["file_path"] = file_path
                logger.info(f"[WORKSPACE SANDBOX] Normalized file path -> {file_path}")

        return HookResult(action="continue")

    unregister = hooks.register(
        TOOL_PRE,
        workspace_sandbox_hook,
        priority=400,  # run before approval (500) so approval sees normalized paths
        name="vscode-workspace-sandbox",
    )

    logger.info("[WORKSPACE SANDBOX] Hook registered to enforce workspace root")
    return unregister
