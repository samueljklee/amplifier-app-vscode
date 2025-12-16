"""Session runner wrapping amplifier-core session."""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from amplifier_core import AmplifierSession
from amplifier_profiles import ProfileLoader, compile_profile_to_mount_plan
from amplifier_collections import CollectionResolver
from amplifier_module_resolution import StandardModuleSourceResolver

from .ux_systems import VSCodeApprovalSystem, VSCodeDisplaySystem
from ..hooks import register_streaming_hooks, register_approval_hook

logger = logging.getLogger(__name__)


def _get_collection_resolver() -> tuple[CollectionResolver | None, list[Path]]:
    """Get collection resolver and profile search paths.
    
    Returns:
        Tuple of (collection_resolver, search_paths)
    """
    search_paths = [
        Path.home() / ".amplifier" / "profiles",
        Path(".amplifier") / "profiles",
    ]
    
    # Add collection paths (including local vscode collection)
    collection_search_paths = [
        # Local vscode collection (bundled with extension) - FIRST priority
        Path(__file__).parent.parent / "data" / "collections",
        # User collections
        Path.home() / ".amplifier" / "collections",
        Path.home() / ".local" / "share" / "amplifier" / "collections",
    ]
    
    # Initialize resolver with collection search paths
    try:
        resolver = CollectionResolver(search_paths=collection_search_paths)
        
        # Add profiles directory from each discovered collection
        # list_collections() returns tuples of (collection_name, collection_path)
        for collection_name, collection_path in resolver.list_collections():
            profiles_dir = collection_path / "profiles"
            if profiles_dir.exists():
                search_paths.append(profiles_dir)
        
        return resolver, search_paths
    except Exception:
        # If collection resolver fails, just use local paths
        return None, search_paths


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
        """Initialize the session with ProfileLoader and amplifier-core.
        
        Returns:
            session_id: The session identifier
        """
        try:
            logger.info(f"[SESSION START] Starting session {self.session_id} with profile '{self.profile_name}'")
            logger.debug(f"[SESSION START] Credentials provided: {bool(self.credentials)}")
            logger.debug(f"[SESSION START] Workspace context provided: {bool(self.workspace_context)}")
            
            # Load profile using discovered search paths and collection resolver
            resolver, search_paths = _get_collection_resolver()
            logger.debug(f"[SESSION START] Profile search paths: {len(search_paths)} paths")
            
            loader = ProfileLoader(
                search_paths=search_paths,
                collection_resolver=resolver  # Required for resolving collection:path references
            )
            
            logger.info(f"[SESSION START] Loading profile '{self.profile_name}'...")
            profile = loader.load_profile(self.profile_name)
            logger.info(f"[SESSION START] Profile loaded successfully")
            
            # Compile to mount plan
            logger.debug(f"[SESSION START] Compiling profile to mount plan...")
            mount_plan = compile_profile_to_mount_plan(profile)
            logger.debug(f"[SESSION START] Mount plan compiled. Providers: {len(mount_plan.get('providers', []))}")
            
            # Inject credentials into provider config
            if self.credentials and "providers" in mount_plan:
                logger.info(f"[SESSION START] 🔑 Injecting credentials into {len(mount_plan['providers'])} providers")
                logger.info(f"[SESSION START] 🔑 Credentials keys available: {list(self.credentials.keys())}")
                
                for provider in mount_plan["providers"]:
                    logger.info(f"[SESSION START] 🔑 Processing provider module: {provider.get('module')}")
                    
                    if "config" not in provider:
                        provider["config"] = {}
                    
                    # Inject API keys
                    if provider["module"] == "provider-anthropic":
                        if "anthropic_api_key" in self.credentials:
                            provider["config"]["api_key"] = self.credentials["anthropic_api_key"]
                            logger.info(f"[SESSION START] ✅ Injected Anthropic API key into provider config")
                            logger.debug(f"[SESSION START] 🔑 Provider config keys: {list(provider['config'].keys())}")
                        else:
                            logger.warning(f"[SESSION START] ❌ No 'anthropic_api_key' found in credentials dict")
                            logger.warning(f"[SESSION START] 🔍 Available credential keys: {list(self.credentials.keys())}")
            else:
                logger.warning(f"[SESSION START] ⚠️  No credentials ({bool(self.credentials)}) or providers ({bool(mount_plan.get('providers'))}) to inject into")
            
            # Inject workspace directory into tool config
            if self.workspace_context.get("workspace_root") and "tools" in mount_plan:
                workspace_root = self.workspace_context["workspace_root"]
                logger.info(f"[SESSION START] 📁 Injecting workspace restrictions into {len(mount_plan['tools'])} tools")
                logger.info(f"[SESSION START] 📁 Workspace root to inject: {workspace_root}")
                logger.info(f"[SESSION START] 📁 This will restrict tool operations to: {workspace_root}")
                
                injected_count = 0
                for tool in mount_plan["tools"]:
                    tool_module = tool.get('module', 'unknown')
                    logger.info(f"[SESSION START]   📦 Processing tool: {tool_module}")
                    
                    if "config" not in tool:
                        tool["config"] = {}
                    
                    # Inject appropriate workspace restriction parameters per tool
                    if tool_module == "tool-bash":
                        # tool-bash uses working_dir (single directory)
                        tool["config"]["working_dir"] = workspace_root
                        injected_count += 1
                        logger.info(f"[SESSION START]   ✅ Injected working_dir: {workspace_root}")
                    elif tool_module == "tool-filesystem":
                        # tool-filesystem uses allowed_write_paths (list of allowed dirs)
                        tool["config"]["allowed_write_paths"] = [workspace_root]
                        # Also set working_dir for read operations
                        tool["config"]["working_dir"] = workspace_root
                        injected_count += 1
                        logger.info(f"[SESSION START]   ✅ Injected allowed_write_paths: [{workspace_root}]")
                        logger.info(f"[SESSION START]   ✅ Injected working_dir: {workspace_root}")
                    elif tool_module == "tool-search":
                        # tool-search uses working_dir (single directory)
                        tool["config"]["working_dir"] = workspace_root
                        injected_count += 1
                        logger.info(f"[SESSION START]   ✅ Injected working_dir: {workspace_root}")
                    else:
                        logger.debug(f"[SESSION START]   ⏭️  Skipped (not a filesystem tool)")
                    
                    if tool_module in ["tool-bash", "tool-filesystem", "tool-search"]:
                        logger.info(f"[SESSION START]   ✅ Tool config now has: {list(tool['config'].keys())}")
                
                logger.info(f"[SESSION START] 📁 ✨ Successfully configured {injected_count} tools")
            else:
                logger.warning(f"[SESSION START] ⚠️  Cannot inject workspace_dir:")
                logger.warning(f"[SESSION START]     - Has workspace_root: {bool(self.workspace_context.get('workspace_root'))}")
                logger.warning(f"[SESSION START]     - Has tools: {bool(mount_plan.get('tools'))}")
                if self.workspace_context.get('workspace_root'):
                    logger.warning(f"[SESSION START]     - Workspace root value: {self.workspace_context['workspace_root']}")
                if mount_plan.get('tools'):
                    logger.warning(f"[SESSION START]     - Tools: {[t.get('module') for t in mount_plan.get('tools', [])]}")
            
            # Inject workspace context into system instruction
            if self.workspace_context:
                mount_plan = self._inject_workspace_context(mount_plan)
                logger.debug(f"[SESSION START] Workspace context injected")
            
            # Create amplifier-core session
            logger.info(f"[SESSION START] Creating AmplifierSession...")
            self.session = AmplifierSession(
                config=mount_plan,
                session_id=self.session_id,
                approval_system=self.approval_system,
                display_system=self.display_system,
            )
            logger.info(f"[SESSION START] AmplifierSession created")
            
            # Store reference to session_runner for hooks to access
            self.session._session_runner = self
            logger.debug(f"[SESSION START] Session runner reference stored for hook access")
            logger.info(f"[SESSION START] 🔒 always_allow_tools flag: {self.always_allow_tools}")
            
            # Validation summary
            logger.info(f"[SESSION START] ═══════════════════════════════════════")
            logger.info(f"[SESSION START] 🔍 Workspace Directory Validation:")
            logger.info(f"[SESSION START]   Server CWD: {Path.cwd()}")
            logger.info(f"[SESSION START]   VSCode Workspace: {self.workspace_context.get('workspace_root', '(none)')}")
            logger.info(f"[SESSION START]   Tools will operate in: {self.workspace_context.get('workspace_root', 'UNRESTRICTED!')}")
            logger.info(f"[SESSION START] ═══════════════════════════════════════")
            
            # Mount module source resolver BEFORE initialization
            # This enables git-based module loading from profile sources
            logger.info(f"[SESSION START] Mounting module source resolver...")
            resolver = StandardModuleSourceResolver(
                workspace_dir=Path(self.workspace_context.get("workspace_root")) if self.workspace_context.get("workspace_root") else None,
            )
            
            # Create a mount function for the resolver
            async def mount_resolver(coordinator):
                await coordinator.mount("module-source-resolver", resolver, name="standard")
                return None  # No cleanup needed
            
            # Mount the resolver
            await mount_resolver(self.session.coordinator)
            logger.info(f"[SESSION START] Module source resolver mounted")
            
            # Register streaming bridge hooks BEFORE initialization
            # This ensures hooks are active when orchestrator starts emitting events
            logger.info(f"[SESSION START] About to register streaming bridge hooks for session {self.session_id}")
            self._hook_unregisters = register_streaming_hooks(self.session.coordinator)
            logger.info(f"[SESSION START] Streaming bridge hooks registered: {len(self._hook_unregisters)} hooks")
            
            # Register approval gate hook
            # This hook intercepts tool:pre events and returns action="ask_user" for destructive tools
            logger.info(f"[SESSION START] Registering approval gate hook...")
            approval_unregister = register_approval_hook(self.session.coordinator)
            self._hook_unregisters.append(approval_unregister)
            logger.info(f"[SESSION START] Approval gate hook registered")
            
            # Verify hooks were registered
            hooks = self.session.coordinator.hooks
            all_handlers = hooks.list_handlers()
            vscode_handlers = {k: v for k, v in all_handlers.items() if any('vscode' in str(n).lower() for n in v)}
            logger.info(f"[SESSION START] VSCode hooks active: {list(vscode_handlers.keys())}")
            
            # Initialize the session (now modules can be loaded from git)
            logger.info(f"[SESSION START] Initializing session (loading modules)...")
            await self.session.initialize()
            logger.info(f"[SESSION START] Session initialized successfully!")
            
            # Verify providers were mounted
            providers = self.session.coordinator.get("providers")
            logger.info(f"[SESSION START] Providers mounted: {len(providers) if providers else 0}")
            if not providers:
                logger.error(f"[SESSION START] ❌ NO PROVIDERS MOUNTED! This will cause errors.")
            
            self.status = "idle"
            self.last_activity = datetime.now()
            
            logger.info(f"[SESSION START] ✅ Session {self.session_id} ready with status={self.status}")
            return self.session_id
            
        except Exception as e:
            logger.error(f"[SESSION START] ❌ Session initialization failed: {e}")
            logger.error(f"[SESSION START] Error type: {type(e).__name__}")
            import traceback
            logger.error(f"[SESSION START] Traceback:\n{traceback.format_exc()}")
            
            self.status = "error"
            await self._emit_event("error", {"error": str(e)})
            raise
    
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
