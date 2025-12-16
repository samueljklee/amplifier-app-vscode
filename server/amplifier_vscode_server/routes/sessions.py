"""Session management routes."""

import asyncio
import json
import logging
import traceback
from datetime import datetime
from typing import Dict
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

from ..models import (
    CreateSessionRequest,
    CreateSessionResponse,
    PromptRequest,
    PromptResponse,
    ApprovalRequest,
    ApprovalResponse,
    SessionStatus,
    SessionListResponse,
    SessionListItem,
    DeleteSessionResponse,
    TokenUsage,
)
from ..core.session_runner import SessionRunner

router = APIRouter()

# In-memory session storage
_sessions: Dict[str, SessionRunner] = {}


@router.post("/sessions", response_model=CreateSessionResponse, status_code=201)
async def create_session(request: CreateSessionRequest) -> CreateSessionResponse:
    """Create a new Amplifier session."""
    session_id = str(uuid4())
    
    try:
        logger.info(f"Creating session {session_id} with profile '{request.profile}'")
        logger.debug(f"Credentials provided: {bool(request.credentials)}")
        logger.debug(f"Context provided: {bool(request.context)}")
        
        # Create session runner
        runner = SessionRunner(
            session_id=session_id,
            profile_name=request.profile,
            credentials=request.credentials.model_dump() if request.credentials else {},
            workspace_context=request.context.model_dump() if request.context else {},
        )
        
        # Start the session (initialize amplifier-core)
        logger.info(f"Starting session {session_id}...")
        await runner.start()
        
        # Store session
        _sessions[session_id] = runner
        
        logger.info(f"Session {session_id} created successfully")
        return CreateSessionResponse(
            session_id=session_id,
            status="created",
            profile=request.profile,
            created_at=datetime.now(),
        )
    except Exception as e:
        # Log full traceback for debugging
        logger.error(f"Failed to create session {session_id}:")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "SESSION_CREATE_FAILED",
                    "message": f"Failed to create session: {str(e)}",
                    "details": {
                        "profile": request.profile,
                        "error_type": type(e).__name__
                    }
                }
            }
        )


@router.get("/sessions/{session_id}", response_model=SessionStatus)
async def get_session_status(session_id: str) -> SessionStatus:
    """Get session status."""
    runner = _sessions.get(session_id)
    if not runner:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "SESSION_NOT_FOUND",
                    "message": f"Session with ID '{session_id}' not found",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    return SessionStatus(
        session_id=session_id,
        status=runner.status,
        profile=runner.profile_name,
        created_at=runner.created_at,
        last_activity=runner.last_activity,
        message_count=runner.message_count,
        token_usage=TokenUsage(
            input_tokens=runner.input_tokens,
            output_tokens=runner.output_tokens
        ) if runner.input_tokens > 0 else None,
        pending_approval=runner.pending_approval,
    )


@router.get("/sessions/{session_id}/events")
async def session_events(session_id: str, request: Request):
    """Stream session events via Server-Sent Events."""
    runner = _sessions.get(session_id)
    if not runner:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "SESSION_NOT_FOUND",
                    "message": f"Session with ID '{session_id}' not found",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    async def event_generator():
        """Generate SSE events from session queue."""
        try:
            # Send initial session:start event
            # Note: SSE 'data' field must be a JSON string, not a dict
            yield {
                "event": "message",
                "data": json.dumps({
                    "event": "session:start",
                    "data": {
                        "session_id": session_id,
                        "profile": runner.profile_name,
                        "timestamp": datetime.now().isoformat()
                    }
                })
            }
            
            # Stream events from queue
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                try:
                    # Wait for next event with timeout for keepalive
                    event = await asyncio.wait_for(runner.event_queue.get(), timeout=5.0)
                    # Stringify the event data for SSE
                    yield {"event": "message", "data": json.dumps(event)}
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield {"event": "ping", "data": "keepalive"}
                    
        except Exception as e:
            # Send error event
            yield {
                "event": "message",
                "data": json.dumps({
                    "event": "error",
                    "data": {
                        "session_id": session_id,
                        "error": str(e)
                    }
                })
            }
    
    return EventSourceResponse(event_generator())


@router.post("/sessions/{session_id}/prompt", response_model=PromptResponse)
async def submit_prompt(session_id: str, request: PromptRequest) -> PromptResponse:
    """Submit a prompt to a session."""
    runner = _sessions.get(session_id)
    if not runner:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "SESSION_NOT_FOUND",
                    "message": f"Session with ID '{session_id}' not found",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    if runner.status == "processing":
        raise HTTPException(
            status_code=409,
            detail={
                "error": {
                    "code": "SESSION_BUSY",
                    "message": "Session is already processing another prompt",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    try:
        # Submit prompt asynchronously
        request_id = f"req-{uuid4().hex[:8]}"
        asyncio.create_task(runner.prompt(request.prompt, request.context_update))
        
        return PromptResponse(
            request_id=request_id,
            status="processing",
            message="Prompt submitted, subscribe to events for response"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "PROMPT_SUBMIT_FAILED",
                    "message": f"Failed to submit prompt: {str(e)}",
                    "details": {"session_id": session_id}
                }
            }
        )


@router.post("/sessions/{session_id}/approval", response_model=ApprovalResponse)
async def submit_approval(session_id: str, request: ApprovalRequest) -> ApprovalResponse:
    """Submit approval decision for a session."""
    runner = _sessions.get(session_id)
    if not runner:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "SESSION_NOT_FOUND",
                    "message": f"Session with ID '{session_id}' not found",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    if not runner.pending_approval:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "NO_PENDING_APPROVAL",
                    "message": "No pending approval for this session",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    try:
        # Resolve the approval
        await runner.resolve_approval(request.decision)
        
        return ApprovalResponse(
            status="approved",
            message="Approval decision recorded"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "APPROVAL_FAILED",
                    "message": f"Failed to submit approval: {str(e)}",
                    "details": {"session_id": session_id}
                }
            }
        )


@router.post("/sessions/{session_id}/test-approval")
async def test_approval_flow(session_id: str):
    """Test endpoint to trigger approval flow manually."""
    runner = _sessions.get(session_id)
    if not runner:
        raise HTTPException(404, "Session not found")
    
    # Manually trigger approval request for testing
    asyncio.create_task(runner.approval_system.request_approval(
        prompt="Test approval: Allow this test operation?",
        options=["Allow", "Deny", "Skip"],
        timeout=30.0,
        default="deny",
        context={"test": True, "operation": "test_approval_flow"}
    ))
    
    return {"status": "approval_requested", "message": "Check VS Code for approval dialog"}


@router.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
async def delete_session(session_id: str) -> DeleteSessionResponse:
    """Stop and delete a session."""
    runner = _sessions.get(session_id)
    if not runner:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "SESSION_NOT_FOUND",
                    "message": f"Session with ID '{session_id}' not found",
                    "details": {"session_id": session_id}
                }
            }
        )
    
    try:
        # Stop the session
        await runner.stop()
        
        # Remove from storage
        del _sessions[session_id]
        
        return DeleteSessionResponse(
            status="stopped",
            message="Session stopped and cleaned up"
        )
    except Exception as e:
        # Remove even if stop fails
        _sessions.pop(session_id, None)
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "SESSION_DELETE_FAILED",
                    "message": f"Failed to delete session: {str(e)}",
                    "details": {"session_id": session_id}
                }
            }
        )


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(status: str | None = None, limit: int = 50) -> SessionListResponse:
    """List all active sessions."""
    sessions = []
    
    for session_id, runner in _sessions.items():
        # Filter by status if provided
        if status and runner.status != status:
            continue
        
        sessions.append(SessionListItem(
            session_id=session_id,
            status=runner.status,
            profile=runner.profile_name,
            created_at=runner.created_at
        ))
    
    # Apply limit
    sessions = sessions[:limit]
    
    return SessionListResponse(
        sessions=sessions,
        total=len(_sessions)
    )
