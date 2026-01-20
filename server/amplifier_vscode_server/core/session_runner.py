"""Session runner wrapping amplifier-core session."""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from amplifier_core import AmplifierSession
from amplifier_foundation import load_bundle

from .ux_systems import VSCodeApprovalSystem, VSCodeDisplaySystem
from ..hooks import (
    register_streaming_hooks,
    register_approval_hook,
    register_workspace_hook,
)

logger = logging.getLogger(__name__)


def _get_bundle_path(bundle_name: str) -> str:
    """Get the bundle path for a bundle name.
    
    Args:
        bundle_name: Name of the bundle (alphanumeric, hyphens, underscores only)
        
    Returns:
        Bundle URI (file:// path to the bundle markdown)
        
    Raises:
        ValueError: If bundle_name contains invalid characters
    """
    # Security: Validate bundle name to prevent path traversal
    # Only allow alphanumeric, hyphens, and underscores
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', bundle_name):
        raise ValueError(f"Invalid bundle name: {bundle_name}. Only alphanumeric, hyphens, and underscores allowed.")
    
    # Check local vscode bundles first
    local_bundles = Path(__file__).parent.parent / "data" / "collections" / "vscode" / "bundles"
    local_path = local_bundles / f"{bundle_name}.md"
    if local_path.exists():
        return f"file://{local_path}"
    
    # Check user bundles
    user_bundles = Path.home() / ".amplifier" / "bundles"
    user_path = user_bundles / f"{bundle_name}.md"
    if user_path.exists():
        return f"file://{user_path}"
    
    # Fall back to well-known bundles (foundation will resolve)
    return bundle_name


class SessionRunner:
    """Manages an Amplifier session with event streaming to VS Code."""
    
    def __init__(
        self,
        session_id: str,
        profile_name: str,
        credentials: dict[str, Any],
        workspace_context: dict[str, Any],
    ):
        self.session_id = session_id
        self.profile_name = profile_name
        self.credentials = credentials
        self.workspace_context = workspace_context
        
        # Log workspace context for validation
        logger.info(f"[SESSION INIT] 🏗️  Creating SessionRunner {session_id}")
        logger.info(f"[SESSION INIT]   📁 Workspace root from VSCode: {workspace_context.get('workspace_root', '(none)')}")
        logger.info(f"[SESSION INIT]   📋 Context keys: {list(workspace_context.keys())}")
        
        # Session state
        self.session: AmplifierSession | None = None
        self.status: Literal["idle", "processing", "awaiting_approval", "error", "stopped"] = "idle"
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        
        # Usage tracking
        self.message_count = 0
        self.input_tokens = 0
        self.output_tokens = 0
        
        # Event queue for SSE streaming
        self.event_queue: asyncio.Queue = asyncio.Queue()
        
        # Approval handling
        self.pending_approval: dict[str, Any] | None = None
        self.approval_future: asyncio.Future | None = None
        self.always_allow_tools: bool = False  # Session-scoped flag for "Always Allow"
        
        # UX systems
        self.approval_system = VSCodeApprovalSystem(self)
        self.display_system = VSCodeDisplaySystem(self)
        
        # Hook unregister functions (populated during start)
        self._hook_unregisters: list[callable] = []
    
    async def start(self) -> str:
        """Initialize the session using modern foundation bundle pattern.
        
        Returns:
            session_id: The session identifier
        """
        try:
            logger.info(f"[SESSION START] Starting session {self.session_id} with bundle '{self.profile_name}'")
            logger.debug(f"[SESSION START] Credentials provided: {bool(self.credentials)}")
            logger.debug(f"[SESSION START] Workspace context provided: {bool(self.workspace_context)}")
            
            # Get bundle path
            bundle_uri = _get_bundle_path(self.profile_name)
            logger.info(f"[SESSION START] Loading bundle from: {bundle_uri}")
            
            # Load bundle using foundation
            bundle = await load_bundle(bundle_uri)
            logger.info(f"[SESSION START] Bundle loaded: {bundle.name} v{bundle.version}")
            
            # Inject credentials into bundle config before prepare
            if self.credentials:
                logger.info(f"[SESSION START] Injecting credentials: {list(self.credentials.keys())}")
                self._inject_credentials_into_bundle(bundle)
            
            # Inject workspace config into bundle
            workspace_root = self.workspace_context.get("workspace_root")
            if workspace_root:
                logger.info(f"[SESSION START] Injecting workspace root: {workspace_root}")
                self._inject_workspace_into_bundle(bundle, workspace_root)
            
            # Prepare bundle (downloads modules, installs deps)
            logger.info(f"[SESSION START] Preparing bundle...")
            prepared = await bundle.prepare(install_deps=True)
            logger.info(f"[SESSION START] Bundle prepared successfully")
            
            # Create session from prepared bundle
            logger.info(f"[SESSION START] Creating session from prepared bundle...")
            self.session = await prepared.create_session(
                session_id=self.session_id,
                approval_system=self.approval_system,
                display_system=self.display_system,
            )
            logger.info(f"[SESSION START] Session created")
            
            # Store reference to session_runner for hooks to access
            self.session._session_runner = self
            logger.info(f"[SESSION START] always_allow_tools flag: {self.always_allow_tools}")
            
            # Validation summary
            logger.info(f"[SESSION START] ═══════════════════════════════════════")
            logger.info(f"[SESSION START] Workspace Directory Validation:")
            logger.info(f"[SESSION START]   Server CWD: {Path.cwd()}")
            logger.info(f"[SESSION START]   VSCode Workspace: {workspace_root or '(none)'}")
            logger.info(f"[SESSION START]   Tools will operate in: {workspace_root or 'UNRESTRICTED!'}")
            logger.info(f"[SESSION START] ═══════════════════════════════════════")
            
            # Register streaming bridge hooks
            logger.info(f"[SESSION START] Registering streaming bridge hooks...")
            self._hook_unregisters = register_streaming_hooks(self.session.coordinator)
            logger.info(f"[SESSION START] Streaming hooks registered: {len(self._hook_unregisters)}")
            
            # Register workspace sandbox hook
            if workspace_root:
                logger.info(f"[SESSION START] Registering workspace sandbox hook...")
                sandbox_unregister = register_workspace_hook(
                    self.session.coordinator,
                    workspace_root,
                )
                self._hook_unregisters.append(sandbox_unregister)
            
            # Register approval gate hook
            logger.info(f"[SESSION START] Registering approval gate hook...")
            approval_unregister = register_approval_hook(self.session.coordinator)
            self._hook_unregisters.append(approval_unregister)
            
            # Verify providers were mounted
            providers = self.session.coordinator.get("providers")
            logger.info(f"[SESSION START] Providers mounted: {len(providers) if providers else 0}")
            if not providers:
                logger.error(f"[SESSION START] NO PROVIDERS MOUNTED! This will cause errors.")
            
            self.status = "idle"
            self.last_activity = datetime.now()
            
            logger.info(f"[SESSION START] Session {self.session_id} ready")
            return self.session_id
            
        except Exception as e:
            logger.error(f"[SESSION START] Session initialization failed: {e}")
            import traceback
            logger.error(f"[SESSION START] Traceback:\n{traceback.format_exc()}")
            
            self.status = "error"
            await self._emit_event("error", {"error": str(e)})
            raise
    
    def _inject_credentials_into_bundle(self, bundle) -> None:
        """Inject API credentials into bundle provider configs."""
        providers = getattr(bundle, 'providers', [])
        if not providers:
            return
        
        for provider in providers:
            module_id = provider.get('module', '')
            if 'config' not in provider:
                provider['config'] = {}
            
            # Map credential keys to provider config
            if module_id == 'provider-anthropic' and 'anthropic_api_key' in self.credentials:
                provider['config']['api_key'] = self.credentials['anthropic_api_key']
                logger.info(f"[CREDENTIALS] Injected Anthropic API key")
            elif module_id == 'provider-openai' and 'openai_api_key' in self.credentials:
                provider['config']['api_key'] = self.credentials['openai_api_key']
                logger.info(f"[CREDENTIALS] Injected OpenAI API key")
    
    def _inject_workspace_into_bundle(self, bundle, workspace_root: str) -> None:
        """Inject workspace directory into bundle tool configs."""
        tools = getattr(bundle, 'tools', [])
        if not tools:
            return
        
        for tool in tools:
            module_id = tool.get('module', '')
            if 'config' not in tool:
                tool['config'] = {}
            
            # Inject workspace restrictions per tool type
            if module_id == 'tool-bash':
                tool['config']['working_dir'] = workspace_root
            elif module_id == 'tool-filesystem':
                tool['config']['allowed_write_paths'] = [workspace_root]
                tool['config']['working_dir'] = workspace_root
            elif module_id == 'tool-search':
                tool['config']['working_dir'] = workspace_root
    
    async def prompt(self, prompt: str, context_update: dict[str, Any] | None = None) -> None:
        """Submit a prompt to the session.
        
        Args:
            prompt: User prompt
            context_update: Optional context updates
        """
        if not self.session:
            raise RuntimeError("Session not initialized")
        
        if self.status != "idle":
            raise RuntimeError(f"Session is {self.status}, cannot accept prompt")
        
        try:
            self.status = "processing"
            self.message_count += 1
            self.last_activity = datetime.now()
            
            # Emit prompt submit event
            await self._emit_event("prompt:submit", {
                "prompt": prompt,
                "context_update": context_update
            })
            
            # Format context and enhance prompt
            formatted_prompt = prompt
            if context_update:
                context_str = self._format_workspace_context(context_update)
                if context_str:
                    formatted_prompt = f"{context_str}\n\n# User Message:\n{prompt}"
                    logger.info(f"[CONTEXT] Enhanced prompt with workspace context ({len(context_str)} chars)")
            
            # Execute prompt through amplifier-core
            # The session will call our UX systems which emit events
            response = await self.session.execute(formatted_prompt)
            
            # Extract token usage from the streaming bridge hook
            try:
                token_usage_getter = self.session.coordinator.get_capability("vscode.token_usage")
                logger.info(f"[TOKEN TRACKING] Token usage getter capability: {token_usage_getter is not None}")
                
                if token_usage_getter:
                    usage = token_usage_getter()
                    logger.info(f"[TOKEN TRACKING] Retrieved usage from capability: {usage}")
                    
                    if usage:
                        # The hook tracks cumulative usage, so just use those values
                        self.input_tokens = usage.get("input_tokens", 0)
                        self.output_tokens = usage.get("output_tokens", 0)
                        logger.info(f"[TOKEN TRACKING] Final token counts: input={self.input_tokens}, output={self.output_tokens}")
                    else:
                        logger.warning("[TOKEN TRACKING] Usage capability returned None")
                else:
                    logger.warning("[TOKEN TRACKING] Token usage capability not available from streaming bridge")
            except Exception as e:
                logger.error(f"[TOKEN TRACKING] Failed to extract token usage: {e}", exc_info=True)
            
            # Emit completion event
            token_usage_data = {
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens
            }
            logger.info(f"[TOKEN TRACKING] Emitting prompt:complete with token_usage: {token_usage_data}")
            
            await self._emit_event("prompt:complete", {
                "response": response,
                "token_usage": token_usage_data
            })
            
            self.status = "idle"
            self.last_activity = datetime.now()
            
        except Exception as e:
            self.status = "error"
            await self._emit_event("error", {"error": str(e)})
            raise
    
    async def stop(self) -> None:
        """Stop and cleanup the session."""
        # Unregister streaming hooks first
        for unregister in self._hook_unregisters:
            try:
                unregister()
            except Exception as e:
                logger.warning(f"Error unregistering hook: {e}")
        self._hook_unregisters.clear()
        
        if self.session:
            try:
                await self.session.cleanup()
            except Exception as e:
                # Log but don't fail
                await self._emit_event("warning", {"message": f"Cleanup error: {str(e)}"})
            finally:
                self.session = None
        
        self.status = "stopped"
        await self._emit_event("session:end", {
            "reason": "user_stopped",
            "token_usage": {
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens
            }
        })
    
    async def resolve_approval(self, decision: str) -> None:
        """Resolve a pending approval request.
        
        Args:
            decision: The user's decision (e.g., "Allow", "Deny", "AlwaysAllow")
        """
        if not self.pending_approval:
            raise ValueError("No pending approval")
        
        if not self.approval_future:
            raise ValueError("No approval future set")
        
        logger.info(f"[APPROVAL] 📥 resolve_approval() called with decision: {decision}")
        logger.info(f"[APPROVAL]   Current always_allow_tools: {self.always_allow_tools}")
        
        # Check if user chose "Always Allow"
        if decision == "AlwaysAllow":
            self.always_allow_tools = True
            logger.info(f"[SESSION] 🔓 Always Allow ENABLED for session {self.session_id}")
            decision = "Allow"  # Treat as Allow for this request
        
        # Resolve the future with the decision
        logger.info(f"[APPROVAL] Setting future result to: {decision}")
        self.approval_future.set_result(decision)
        logger.info(f"[APPROVAL] ✅ Future resolved")
        
        # Clear pending state
        self.pending_approval = None
        self.approval_future = None
        
        # Update status
        if self.status == "awaiting_approval":
            self.status = "processing"
    
    def _format_workspace_context(self, context: dict[str, Any]) -> str:
        """Format workspace context into a string for LLM consumption.
        
        Args:
            context: Workspace context dictionary
            
        Returns:
            Formatted context string to prepend to user prompt
        """
        lines = ["# Current Workspace Context"]
        lines.append("")
        
        # Workspace root
        if workspace_root := context.get("workspace_root"):
            lines.append(f"**Workspace:** `{workspace_root}`")
            lines.append("")
        
        # Open files
        if open_files := context.get("open_files"):
            lines.append(f"## Open Files ({len(open_files)} files)")
            for i, file in enumerate(open_files[:5], 1):  # Limit to 5 for brevity
                path = file.get("path", "unknown")
                language = file.get("language", "text")
                content_len = len(file.get("content", ""))
                lines.append(f"{i}. `{path}` ({language}, {content_len:,} chars)")
                
                # Include cursor position if available
                if cursor := file.get("cursor_position"):
                    line = cursor.get("line", 0)
                    char = cursor.get("character", 0)
                    lines.append(f"   - Cursor at line {line}, column {char}")
            
            if len(open_files) > 5:
                lines.append(f"   - ...and {len(open_files) - 5} more files")
            lines.append("")
        
        # Git state
        if git := context.get("git_state"):
            lines.append("## Git Status")
            lines.append(f"- Branch: `{git.get('branch', 'unknown')}`")
            
            if staged := git.get("staged_files"):
                lines.append(f"- Staged: {len(staged)} files")
                if staged:
                    for f in staged[:3]:
                        lines.append(f"  - `{f}`")
                    if len(staged) > 3:
                        lines.append(f"  - ...and {len(staged) - 3} more")
            
            if modified := git.get("modified_files"):
                lines.append(f"- Modified: {len(modified)} files")
                if modified:
                    for f in modified[:3]:
                        lines.append(f"  - `{f}`")
                    if len(modified) > 3:
                        lines.append(f"  - ...and {len(modified) - 3} more")
            
            if untracked := git.get("untracked_files"):
                lines.append(f"- Untracked: {len(untracked)} files")
            
            lines.append("")
        
        # Selection
        if selection := context.get("selection"):
            lines.append("## Current Selection")
            path = selection.get("path", "unknown")
            text = selection.get("text", "")
            lines.append(f"User has selected text in `{path}`:")
            lines.append("```")
            # Limit selection preview to 10 lines
            text_lines = text.split("\n")
            if len(text_lines) > 10:
                lines.extend(text_lines[:10])
                lines.append(f"... ({len(text_lines) - 10} more lines)")
            else:
                lines.append(text)
            lines.append("```")
            lines.append("")
        
        # Diagnostics
        if diagnostics := context.get("diagnostics"):
            error_count = sum(1 for d in diagnostics if d.get("severity") == "error")
            warning_count = sum(1 for d in diagnostics if d.get("severity") == "warning")
            
            lines.append(f"## Problems ({len(diagnostics)} total)")
            if error_count:
                lines.append(f"- {error_count} errors")
            if warning_count:
                lines.append(f"- {warning_count} warnings")
            
            # Show first 5 diagnostics
            lines.append("")
            for i, diag in enumerate(diagnostics[:5], 1):
                severity = diag.get("severity", "info")
                path = diag.get("path", "unknown")
                message = diag.get("message", "")
                range_data = diag.get("range", {})
                start = range_data.get("start", {})
                line = start.get("line", 0)
                
                icon = "🔴" if severity == "error" else "🟡" if severity == "warning" else "ℹ️"
                lines.append(f"{i}. {icon} `{path}:{line}` - {message[:80]}")
            
            if len(diagnostics) > 5:
                lines.append(f"   - ...and {len(diagnostics) - 5} more issues")
            lines.append("")
        
        return "\n".join(lines)
    
    async def _emit_event(self, event_name: str, data: dict[str, Any]) -> None:
        """Emit an event to the SSE queue.
        
        Args:
            event_name: Event name (e.g., "content_block:delta")
            data: Event data
        """
        event = {
            "event": event_name,
            "data": {
                "session_id": self.session_id,
                **data
            }
        }
        await self.event_queue.put(event)
    
    def _inject_workspace_context(self, mount_plan: dict) -> dict:
        """Inject workspace context into mount plan system instruction.
        
        Args:
            mount_plan: The mount plan dictionary
            
        Returns:
            Modified mount plan
        """
        if not self.workspace_context:
            return mount_plan
        
        # Build context string
        context_parts = []
        
        # Workspace root
        if "workspace_root" in self.workspace_context:
            context_parts.append(f"Workspace: {self.workspace_context['workspace_root']}")
        
        # Git state
        if "git_state" in self.workspace_context and self.workspace_context["git_state"]:
            git = self.workspace_context["git_state"]
            context_parts.append(f"Git Branch: {git.get('branch', 'unknown')}")
            if git.get("modified_files"):
                context_parts.append(f"Modified Files: {', '.join(git['modified_files'][:5])}")
        
        # Diagnostics summary
        if "diagnostics" in self.workspace_context and self.workspace_context["diagnostics"]:
            diag_count = len(self.workspace_context["diagnostics"])
            context_parts.append(f"Active Problems: {diag_count}")
        
        # Selection
        if "selection" in self.workspace_context and self.workspace_context["selection"]:
            sel = self.workspace_context["selection"]
            context_parts.append(f"Selected: {sel.get('path', 'unknown')}")
        
        if context_parts:
            context_str = "\n\n## Current Workspace Context\n" + "\n".join(f"- {part}" for part in context_parts)
            
            # Inject into orchestrator config
            if "orchestrator" not in mount_plan:
                mount_plan["orchestrator"] = {}
            if "config" not in mount_plan["orchestrator"]:
                mount_plan["orchestrator"]["config"] = {}
            
            existing = mount_plan["orchestrator"]["config"].get("system_instruction", "")
            mount_plan["orchestrator"]["config"]["system_instruction"] = f"{context_str}\n\n{existing}"
        
        return mount_plan
