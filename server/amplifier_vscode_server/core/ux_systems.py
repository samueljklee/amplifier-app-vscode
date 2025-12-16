"""VS Code-specific approval and display systems for Amplifier."""

import asyncio
import logging
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .session_runner import SessionRunner

logger = logging.getLogger(__name__)


class VSCodeApprovalSystem:
    """Approval system that communicates approval requests via SSE to VS Code."""
    
    def __init__(self, session_runner: "SessionRunner"):
        self.session_runner = session_runner
    
    async def request_approval(
        self,
        prompt: str,
        options: list[str] | None = None,
        timeout: float = 300.0,
        default: str = "deny",
        context: dict[str, Any] | None = None,
    ) -> str:
        """Request approval from the user via VS Code UI.
        
        Args:
            prompt: Approval prompt text
            options: List of approval options (default: ["Allow", "Deny"])
            timeout: Approval timeout in seconds
            default: Default decision if timeout
            context: Additional context about the approval request
            
        Returns:
            The user's decision
        """
        if options is None:
            options = ["Allow", "Deny"]
        
        # Create approval ID
        approval_id = f"appr-{id(self)}"
        
        # Create future for the approval response
        self.session_runner.approval_future = asyncio.Future()
        
        # Store pending approval
        self.session_runner.pending_approval = {
            "approval_id": approval_id,
            "prompt": prompt,
            "options": options,
            "context": context,
        }
        
        # Update session status
        self.session_runner.status = "awaiting_approval"
        
        # Emit approval:required event
        logger.info(f"[APPROVAL SYSTEM] 📡 Emitting approval:required SSE event...")
        await self.session_runner._emit_event("approval:required", {
            "approval_id": approval_id,
            "prompt": prompt,
            "options": options,
            "timeout": timeout,
            "default": default,
            "context": context or {},
        })
        logger.info(f"[APPROVAL SYSTEM] ✅ approval:required event emitted")
        
        try:
            # Wait for user decision with timeout
            decision = await asyncio.wait_for(
                self.session_runner.approval_future,
                timeout=timeout
            )
            
            # Emit granted event
            await self.session_runner._emit_event("approval:granted", {
                "approval_id": approval_id,
                "decision": decision,
            })
            
            return decision
            
        except asyncio.TimeoutError:
            # Timeout - use default
            await self.session_runner._emit_event("approval:denied", {
                "approval_id": approval_id,
                "decision": default,
                "reason": "timeout",
            })
            
            # Clear pending state
            self.session_runner.pending_approval = None
            self.session_runner.approval_future = None
            
            return default
    
    async def resolve(self, decision: str) -> None:
        """Called by the route handler when user submits approval.
        
        Args:
            decision: The user's decision
        """
        if not self.session_runner.approval_future:
            raise ValueError("No pending approval to resolve")
        
        self.session_runner.approval_future.set_result(decision)


class VSCodeDisplaySystem:
    """Display system that emits events for VS Code UI rendering."""
    
    def __init__(self, session_runner: "SessionRunner"):
        self.session_runner = session_runner
    
    async def display_text(self, text: str, type: str = "info") -> None:
        """Display text in VS Code.
        
        Args:
            text: Text to display
            type: Display type (info, warning, error)
        """
        await self.session_runner._emit_event("display:text", {
            "text": text,
            "type": type,
        })
    
    async def display_thinking(self, thinking: str) -> None:
        """Display thinking/reasoning content.
        
        Args:
            thinking: Thinking content
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[THINKING] VSCodeDisplaySystem.display_thinking() called with {len(thinking)} chars")
        
        await self.session_runner._emit_event("thinking:delta", {
            "delta": thinking,
        })
        
        logger.info(f"[THINKING] thinking:delta event emitted to SSE queue")
    
    async def display_tool_start(
        self,
        tool_name: str,
        operation: str,
        input_data: dict[str, Any]
    ) -> None:
        """Display tool execution start.
        
        Args:
            tool_name: Name of the tool
            operation: Operation being performed
            input_data: Tool input parameters
        """
        await self.session_runner._emit_event("tool:pre", {
            "tool_name": tool_name,
            "operation": operation,
            "input": input_data,
        })
    
    async def display_tool_end(
        self,
        tool_name: str,
        operation: str,
        result: dict[str, Any],
        duration_ms: float | None = None,
    ) -> None:
        """Display tool execution end.
        
        Args:
            tool_name: Name of the tool
            operation: Operation performed
            result: Tool execution result
            duration_ms: Execution duration in milliseconds
        """
        await self.session_runner._emit_event("tool:post", {
            "tool_name": tool_name,
            "operation": operation,
            "result": result,
            "duration_ms": duration_ms,
        })
    
    async def display_content_delta(self, delta: str, block_index: int = 0) -> None:
        """Display streaming content delta.
        
        Args:
            delta: Content delta text
            block_index: Block index for multi-part responses
        """
        await self.session_runner._emit_event("content_block:delta", {
            "block_index": block_index,
            "delta": delta,
        })
    
    async def display_status(
        self,
        status: str,
        message: str | None = None,
        progress: int | None = None,
    ) -> None:
        """Display status update.
        
        Args:
            status: Status string
            message: Optional status message
            progress: Optional progress percentage (0-100)
        """
        await self.session_runner._emit_event("status:update", {
            "status": status,
            "message": message,
            "progress": progress,
        })
