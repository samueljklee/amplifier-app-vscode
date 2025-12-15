"""
Streaming Bridge Hook Module

Bridges amplifier-core orchestrator events to VSCodeDisplaySystem.
Pure event forwarding - no business logic.

Events handled:
- content_block:delta → display_content_delta()
- content_block:start → (tracking only)
- content_block:end → display_thinking() (for thinking blocks)
- tool:pre → display_tool_start()
- tool:post → display_tool_end()
"""

import logging
from typing import TYPE_CHECKING, Any

from amplifier_core import HookResult
from amplifier_core.events import (
    CONTENT_BLOCK_DELTA,
    CONTENT_BLOCK_END,
    CONTENT_BLOCK_START,
    TOOL_POST,
    TOOL_PRE,
)

if TYPE_CHECKING:
    from amplifier_core import ModuleCoordinator

logger = logging.getLogger(__name__)


def register_streaming_hooks(coordinator: "ModuleCoordinator") -> list[callable]:
    """
    Register streaming bridge hooks on the coordinator.
    
    Args:
        coordinator: ModuleCoordinator instance with hooks and display_system
        
    Returns:
        List of unregister functions
    """
    display_system = coordinator.display_system
    
    if not display_system:
        logger.warning("No display_system available - streaming hooks will be no-ops")
    
    unregisters = []
    
    # Track current thinking block (content_block:start/end pattern)
    thinking_state = {"current_thinking": "", "current_block_index": None}
    
    # Track token usage across provider responses
    token_state = {"input_tokens": 0, "output_tokens": 0}
    
    # Content block start - track thinking blocks
    async def on_content_block_start(event: str, data: dict[str, Any]) -> HookResult:
        """Track start of content blocks to identify thinking blocks."""
        logger.info(f"[THINKING] content_block:start received, data keys: {list(data.keys())}")
        
        # Extract block type and index from data
        block_type = data.get("block_type")  # Direct key in data
        block_index = data.get("block_index", data.get("index", 0))
        
        logger.info(f"[THINKING] Block start - type={block_type}, index={block_index}")
        
        if block_type == "thinking":
            thinking_state["current_thinking"] = ""
            thinking_state["current_block_index"] = block_index
            logger.info(f"[THINKING] ✓ Started tracking thinking block at index={block_index}")
        
        return HookResult(action="continue")
    
    # Content block delta - progressive content and thinking updates
    async def on_content_block_delta(event: str, data: dict[str, Any]) -> HookResult:
        """Forward content deltas to display system."""
        if not display_system:
            return HookResult(action="continue")
        
        delta_data = data.get("delta", {})
        delta_type = delta_data.get("type")
        block_index = data.get("index", data.get("block_index", 0))
        
        logger.info(f"[THINKING] content_block:delta - type={delta_type}, index={block_index}")
        
        try:
            if delta_type == "text_delta":
                # Progressive text content
                text = delta_data.get("text", "")
                if text and hasattr(display_system, "display_content_delta"):
                    await display_system.display_content_delta(text, block_index)
                    logger.debug(f"Forwarded text delta: {len(text)} chars")
            
            elif delta_type == "thinking_delta":
                # Accumulate thinking content for end event
                thinking_text = delta_data.get("thinking", "")
                if thinking_text:
                    thinking_state["current_thinking"] += thinking_text
                    logger.info(f"[THINKING] Accumulated thinking delta: {len(thinking_text)} chars (total: {len(thinking_state['current_thinking'])})")
        
        except Exception as e:
            logger.error(f"[THINKING] Error forwarding content delta: {e}", exc_info=True)
        
        return HookResult(action="continue")
    
    # Content block end - emit complete thinking blocks AND track token usage
    async def on_content_block_end(event: str, data: dict[str, Any]) -> HookResult:
        """Emit complete thinking block when content block ends."""
        if not display_system:
            return HookResult(action="continue")
        
        block_index = data.get("block_index", data.get("index", 0))
        total_blocks = data.get("total_blocks")
        is_last_block = block_index == total_blocks - 1 if total_blocks else False
        
        logger.info(f"[THINKING] content_block:end - index={block_index}, total_blocks={total_blocks}, is_last={is_last_block}")
        logger.info(f"[THINKING] State: current_index={thinking_state['current_block_index']}, accumulated={len(thinking_state['current_thinking'])} chars")
        logger.info(f"[THINKING] content_block:end data keys: {list(data.keys())}")
        
        # Extract token usage from the last block (contains response usage)
        usage = data.get("usage")
        if usage and is_last_block:
            input_delta = usage.get("input_tokens", 0)
            output_delta = usage.get("output_tokens", 0)
            token_state["input_tokens"] += input_delta
            token_state["output_tokens"] += output_delta
            logger.info(f"[TOKEN TRACKING] Updated from content_block:end: +{input_delta} input, +{output_delta} output → Total: input={token_state['input_tokens']}, output={token_state['output_tokens']}")
        
        # Check if this was a thinking block - try both accumulated and direct content
        if thinking_state["current_block_index"] == block_index:
            logger.info(f"[THINKING] This is the tracked thinking block (index {block_index})")
            
            # Get thinking content from accumulated deltas OR from block data directly
            thinking_content = thinking_state["current_thinking"]
            
            # If no accumulated content, try extracting from block data directly
            if not thinking_content:
                block = data.get("block", {})
                logger.info(f"[THINKING] Block data keys: {list(block.keys())}")
                logger.info(f"[THINKING] Block data: {block}")
                
                # Try different possible keys for thinking content
                thinking_content = (
                    block.get("thinking") or 
                    block.get("content") or
                    block.get("text") or
                    ""
                )
                logger.info(f"[THINKING] Extracted from block data: {len(thinking_content)} chars")
            
            if thinking_content:
                try:
                    logger.info(f"[THINKING] Emitting thinking block: {len(thinking_content)} chars")
                    if hasattr(display_system, "display_thinking"):
                        await display_system.display_thinking(thinking_content)
                        logger.info(f"[THINKING] display_thinking() called successfully")
                    else:
                        logger.warning(f"[THINKING] display_system missing display_thinking method")
                except Exception as e:
                    logger.error(f"[THINKING] Error forwarding thinking block: {e}", exc_info=True)
                finally:
                    # Reset thinking state
                    thinking_state["current_thinking"] = ""
                    thinking_state["current_block_index"] = None
        
        return HookResult(action="continue")
    
    # Tool execution start
    async def on_tool_pre(event: str, data: dict[str, Any]) -> HookResult:
        """Forward tool start events to display system."""
        if not display_system:
            return HookResult(action="continue")
        
        try:
            tool_name = data.get("tool_name", "unknown")
            tool_input = data.get("input", {})
            
            # Extract operation from tool_use data if available
            tool_use = data.get("tool_use", {})
            operation = tool_use.get("name", tool_name)
            
            if hasattr(display_system, "display_tool_start"):
                await display_system.display_tool_start(
                    tool_name=tool_name,
                    operation=operation,
                    input_data=tool_input
                )
                logger.debug(f"Forwarded tool start: {tool_name}")
        
        except Exception as e:
            logger.error(f"Error forwarding tool start: {e}")
        
        return HookResult(action="continue")
    

    
    # Tool execution complete
    async def on_tool_post(event: str, data: dict[str, Any]) -> HookResult:
        """Forward tool completion events to display system."""
        if not display_system:
            return HookResult(action="continue")
        
        try:
            tool_name = data.get("tool_name", "unknown")
            result = data.get("result", {})
            duration_ms = data.get("duration_ms")
            
            # Extract operation from result if available
            operation = data.get("tool_use", {}).get("name", tool_name)
            
            if hasattr(display_system, "display_tool_end"):
                await display_system.display_tool_end(
                    tool_name=tool_name,
                    operation=operation,
                    result=result,
                    duration_ms=duration_ms
                )
                logger.debug(f"Forwarded tool end: {tool_name}")
        
        except Exception as e:
            logger.error(f"Error forwarding tool end: {e}")
        
        return HookResult(action="continue")
    
    # Register all hooks with priority 1000 (high priority, but after core hooks)
    hooks = coordinator.hooks
    
    # Make token_state accessible for retrieval
    coordinator.register_capability("vscode.token_usage", lambda: token_state.copy())
    
    unregisters.append(
        hooks.register(
            CONTENT_BLOCK_START,
            on_content_block_start,
            priority=1000,
            name="vscode-streaming-start"
        )
    )
    
    unregisters.append(
        hooks.register(
            CONTENT_BLOCK_DELTA,
            on_content_block_delta,
            priority=1000,
            name="vscode-streaming-delta"
        )
    )
    
    unregisters.append(
        hooks.register(
            CONTENT_BLOCK_END,
            on_content_block_end,
            priority=1000,
            name="vscode-streaming-end"
        )
    )
    
    unregisters.append(
        hooks.register(
            TOOL_PRE,
            on_tool_pre,
            priority=1000,
            name="vscode-tool-pre"
        )
    )
    
    unregisters.append(
        hooks.register(
            TOOL_POST,
            on_tool_post,
            priority=1000,
            name="vscode-tool-post"
        )
    )
    
    logger.info("Registered streaming bridge hooks for VSCode display (token tracking via content_block:end)")
    
    return unregisters
