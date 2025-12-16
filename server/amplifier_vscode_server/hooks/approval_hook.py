"""
Approval Gate Hook Module

Intercepts tool:pre events and gates destructive tools behind user approval.
Returns HookResult(action="ask_user") to trigger approval flow via coordinator.

Tools requiring approval:
- write_file: Creating/overwriting files
- edit_file: Modifying existing files
- bash: Executing shell commands
- git: Git operations (not implemented but reserved)

Coordinator detects action="ask_user" and calls approval_system.request_approval().
"""

import logging
from typing import TYPE_CHECKING, Any

from amplifier_core import HookResult
from amplifier_core.events import TOOL_PRE

if TYPE_CHECKING:
    from amplifier_core import ModuleCoordinator

logger = logging.getLogger(__name__)

# Tools that require user approval before execution
APPROVAL_REQUIRED_TOOLS = {
    "write_file",
    "edit_file",
    "bash",
    "git",  # Reserved for future
}


def _build_approval_prompt(tool_name: str, input_data: dict[str, Any]) -> str:
    """
    Build user-friendly approval prompt from tool name and input.
    
    Args:
        tool_name: Name of the tool being invoked
        input_data: Tool input parameters
        
    Returns:
        Human-readable prompt string
    """
    if tool_name == "write_file":
        path = input_data.get("file_path", "file")
        content_length = len(input_data.get("content", ""))
        return f"Allow writing {content_length} characters to '{path}'?"
    
    elif tool_name == "edit_file":
        path = input_data.get("file_path", "file")
        old_len = len(input_data.get("old_string", ""))
        new_len = len(input_data.get("new_string", ""))
        return f"Allow editing '{path}' (replacing {old_len} chars with {new_len} chars)?"
    
    elif tool_name == "bash":
        cmd = input_data.get("command", "command")
        # Truncate long commands for display
        if len(cmd) > 60:
            cmd = cmd[:57] + "..."
        return f"Allow running: {cmd}"
    
    elif tool_name == "git":
        # Reserved for future git tool implementation
        operation = input_data.get("operation", "operation")
        return f"Allow git {operation}?"
    
    else:
        # Fallback for any other tools added to APPROVAL_REQUIRED_TOOLS
        return f"Allow {tool_name} operation?"


def _create_approval_gate_hook(coordinator: "ModuleCoordinator"):
    """
    Create approval gate hook with coordinator captured in closure.
    
    This factory function creates a hook handler with the correct signature
    (event, data) -> HookResult while capturing coordinator in a closure.
    
    Args:
        coordinator: ModuleCoordinator instance to capture
        
    Returns:
        Hook handler function with correct signature
    """
    async def approval_gate_hook(event: str, data: dict[str, Any]) -> HookResult:
        """
        Hook that gates destructive tools behind user approval.
        
        Registered on tool:pre event. Returns HookResult with action="ask_user"
        for tools requiring approval, which triggers coordinator to call
        approval_system.request_approval().
        
        Args:
            event: Event name (should be "tool:pre")
            data: Event data containing tool_name and input
            
        Returns:
            HookResult with action="ask_user" if approval needed,
            action="continue" if tool is safe to execute
        """
        logger.info("[APPROVAL GATE] 🔍 Hook triggered!")
        logger.info(f"[APPROVAL GATE]   Event: {event}")
        
        tool_name = data.get("tool_name")
        tool_input = data.get("input", {})
        
        logger.info(f"[APPROVAL GATE]   Tool: {tool_name}")
        
        if not tool_name:
            logger.warning("[APPROVAL GATE] ❌ tool:pre event missing tool_name")
            return HookResult(action="continue")
        
        # Check if tool requires approval
        if tool_name not in APPROVAL_REQUIRED_TOOLS:
            logger.info(f"[APPROVAL GATE] ✅ Tool '{tool_name}' does not require approval - CONTINUE")
            return HookResult(action="continue")
        
        logger.info(f"[APPROVAL GATE] 🚦 Tool '{tool_name}' IS in APPROVAL_REQUIRED_TOOLS")
        
        # Check if always-allow is enabled for this session
        session_runner = getattr(coordinator.session, '_session_runner', None)
        logger.info(f"[APPROVAL GATE]   session_runner: {session_runner is not None}")
        
        if session_runner:
            always_allow = getattr(session_runner, 'always_allow_tools', False)
            logger.info(f"[APPROVAL GATE]   always_allow_tools: {always_allow}")
            
            if always_allow:
                logger.info(f"[APPROVAL GATE] ✅ Tool '{tool_name}' auto-approved (always allow enabled)")
                return HookResult(action="continue")
        else:
            logger.warning(f"[APPROVAL GATE] ⚠️ Could not access session_runner from coordinator.session")
        
        # Tool requires approval - build prompt and request approval
        prompt = _build_approval_prompt(tool_name, tool_input)
        
        logger.info(f"[APPROVAL GATE] 🚦 Tool '{tool_name}' requires approval!")
        logger.info(f"[APPROVAL GATE]   Prompt: {prompt}")
        logger.info(f"[APPROVAL GATE]   Options: AlwaysAllow, Allow, Deny")
        logger.info(f"[APPROVAL GATE]   Timeout: 300s")
        logger.info(f"[APPROVAL GATE]   Default: deny")
        
        # Return HookResult with action="ask_user"
        # Coordinator will detect this and call approval_system.request_approval()
        result = HookResult(
            action="ask_user",
            approval_prompt=prompt,
            approval_options=["AlwaysAllow", "Allow", "Deny"],  # 3 options
            approval_timeout=300.0,  # 5 minutes
            approval_default="deny",
            approval_context={
                "tool_name": tool_name,
                "input": tool_input,
                "event": event,
            }
        )
        
        logger.info(f"[APPROVAL GATE] ✅ Returning HookResult(action='ask_user')")
        logger.info(f"[APPROVAL GATE]   HookResult dict: {result.model_dump()}")
        
        return result
    
    return approval_gate_hook


def register_approval_hook(coordinator: "ModuleCoordinator") -> callable:
    """
    Register approval gate hook on the coordinator.
    
    Args:
        coordinator: ModuleCoordinator instance with hooks
        
    Returns:
        Unregister function to remove the hook
    """
    hooks = coordinator.hooks
    
    # Create hook with coordinator captured in closure
    hook_handler = _create_approval_gate_hook(coordinator)
    
    # Register with priority 500 (higher priority than streaming hooks at 1000)
    # This ensures approval checks happen before display events
    unregister = hooks.register(
        TOOL_PRE,
        hook_handler,
        priority=500,  # Run before streaming hooks
        name="vscode-approval-gate"
    )
    
    logger.info("[APPROVAL GATE] Approval gate hook registered on tool:pre")
    
    return unregister
