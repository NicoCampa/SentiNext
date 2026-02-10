"""Chat endpoints: /chat, /chat/simple, /chat/*."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .. import storage, llm, chat as chat_module, chat_agent

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory chat status tracking for SSE
# ---------------------------------------------------------------------------

_chat_status_store: Dict[str, List[str]] = {}
_chat_status_lock = asyncio.Lock()


def _get_chat_status_store() -> Dict[str, List[str]]:
    return _chat_status_store


def _emit_chat_status(session_id: str, status: str) -> None:
    store = _get_chat_status_store()
    if session_id not in store:
        store[session_id] = []
    store[session_id].append(status)
    if len(store[session_id]) > 20:
        store[session_id] = store[session_id][-20:]
    if len(store) > 1000:
        oldest_keys = list(store.keys())[:len(store) - 1000]
        for key in oldest_keys:
            del store[key]


def _get_chat_status(session_id: str) -> List[str]:
    return _get_chat_status_store().get(session_id, [])


def _clear_chat_status(session_id: str) -> None:
    store = _get_chat_status_store()
    if session_id in store:
        del store[session_id]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    question: str = Field(..., min_length=3, max_length=5000)
    sentiment: str = Field("all")
    min_helpful: int = Field(0, ge=0)
    max_days: Optional[int] = Field(None, ge=1, le=365)
    playtime_bucket: str = Field("all")
    language: str = Field("all")
    max_reviews: int = Field(500, ge=1, le=5000)
    max_snippets: int = Field(8, ge=1, le=20)


class SimpleChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    session_id: Optional[str] = None
    app_ids: Optional[List[int]] = Field(None, max_length=2, description="App IDs for game context (max 2)")
    date_filter: str = Field("all", description="Date filter: 30d, 90d, 365d, or all")
    max_reviews_per_game: int = Field(50, ge=1, le=50, description="Max reviews per game")
    language: Optional[str] = Field(None, description="Preferred language for responses")


class ChatCitationItem(BaseModel):
    review_id: str
    app_id: int
    game_name: str
    snippet: str
    votes_up: int
    voted_up: Optional[bool] = None
    playtime_hours: float


class SimpleChatResponse(BaseModel):
    response: str
    session_id: str
    citations: List[ChatCitationItem] = Field(default_factory=list)
    games_used: List[Dict[str, Any]] = Field(default_factory=list)
    reviews_searched: int = 0
    has_game_context: bool = False
    suggested_questions: List[str] = Field(default_factory=list)
    needs_clarification: bool = False
    clarification_options: List[str] = Field(default_factory=list)
    tool_calls_made: int = 0
    suggest_search_game: bool = False
    search_game_name: str = ""
    source_reviews: List[ChatCitationItem] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None
    session_id: Optional[str] = None


class ChatSession(BaseModel):
    session_id: str
    message_count: int
    started_at: Optional[str] = None
    last_message_at: Optional[str] = None
    first_user_message: Optional[str] = None


class ChatCitation(BaseModel):
    review_id: str
    subcategory: str
    snippet: str
    votes_up: Optional[int] = None
    created_at: Optional[str] = None
    voted_up: Optional[bool] = None
    review_text: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    citations: List[ChatCitation]
    used_subcategories: List[str]
    model: str
    review_count: int
    filtered_review_count: int


class CitationFeedbackRequest(BaseModel):
    review_id: str
    session_id: str
    helpful: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
def chat_insights(request: ChatRequest) -> ChatResponse:
    user_id = "local"
    question = (request.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    sentiment = (request.sentiment or "all").strip().lower()
    if sentiment not in {"all", "positive", "negative"}:
        sentiment = "all"

    try:
        payload = chat_module.answer_chat(
            user_id=user_id,
            app_id=request.app_id,
            question=question,
            sentiment=sentiment,
            min_helpful=request.min_helpful,
            max_days=request.max_days,
            playtime_bucket=request.playtime_bucket,
            language=request.language,
            max_reviews=request.max_reviews,
            max_snippets=request.max_snippets,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Chat failed: %s", exc)
        raise HTTPException(status_code=500, detail="Chat request failed.") from exc

    return ChatResponse(**payload)


@router.post("/chat/simple", response_model=SimpleChatResponse)
async def simple_chat(request: SimpleChatRequest) -> SimpleChatResponse:
    user_id = "local"
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    session_id: Optional[str] = None
    try:
        import uuid

        session_id = request.session_id
        if not session_id:
            session_id = str(uuid.uuid4())

        history = storage.load_chat_history(user_id, limit=20, session_id=session_id)

        app_ids = request.app_ids or []
        has_game_context = bool(app_ids)

        if has_game_context:
            logger.info(f"Chat with game context: app_ids={app_ids}, date_filter={request.date_filter}")

            def status_callback(status: str) -> None:
                _emit_chat_status(session_id, status)

            game_metadata = storage.load_game_metadata_for_chat(user_id, app_ids)
            game_names = {g["app_id"]: g["name"] for g in game_metadata}

            agent_context = chat_agent.AgentContext(
                user_id=user_id,
                session_id=session_id,
                app_ids=app_ids,
                date_filter=request.date_filter,
                max_reviews_per_game=request.max_reviews_per_game,
                language=request.language,
                conversation_history=[
                    {"role": msg["role"], "content": msg["content"]}
                    for msg in history
                ],
                game_names=game_names,
            )

            with llm.llm_usage_context(
                user_id=user_id,
                session_id=session_id,
                app_id=app_ids[0] if len(app_ids) == 1 else None,
                operation="chat_agent",
            ):
                agent_result = await chat_agent.run_agent(
                    message=message,
                    context=agent_context,
                    status_callback=status_callback,
                )

            _clear_chat_status(session_id)

            if agent_result.needs_clarification:
                clarification_text = chat_agent.build_clarification_response(
                    agent_result.clarification_options,
                    agent_result.clarification_context,
                )
                return SimpleChatResponse(
                    response=clarification_text,
                    session_id=session_id,
                    citations=[],
                    source_reviews=[],
                    games_used=game_metadata,
                    reviews_searched=0,
                    has_game_context=True,
                    suggested_questions=[],
                    needs_clarification=True,
                    clarification_options=agent_result.clarification_options,
                    tool_calls_made=len(agent_result.tool_calls_made),
                )

            if agent_result.suggest_search_game:
                return SimpleChatResponse(
                    response=agent_result.response,
                    session_id=session_id,
                    citations=[],
                    source_reviews=[],
                    games_used=game_metadata,
                    reviews_searched=0,
                    has_game_context=True,
                    suggested_questions=[],
                    needs_clarification=False,
                    clarification_options=[],
                    tool_calls_made=len(agent_result.tool_calls_made),
                    suggest_search_game=True,
                    search_game_name=agent_result.search_game_name,
                )

            response_text = agent_result.response
            if not response_text or not response_text.strip():
                response_text = "I couldn't generate a complete response. Please try rephrasing your question."
            suggested_questions = agent_result.suggested_questions
            tool_calls_made = len(agent_result.tool_calls_made)

            citations = []
            for tc in agent_result.tool_calls_made:
                if tc.get("tool") == "search_reviews":
                    result_data = tc.get("result", {})
                    for review in result_data.get("reviews", []):
                        if review.get("review_id"):
                            citation_app_id = int(tc.get("params", {}).get("app_id") or (app_ids[0] if app_ids else 0))
                            citation = ChatCitationItem(
                                review_id=str(review.get("review_id", "")),
                                app_id=citation_app_id,
                                game_name=game_names.get(citation_app_id, f"Game {citation_app_id}"),
                                snippet=review.get("text", "")[:200],
                                votes_up=review.get("votes_up", 0),
                                voted_up=review.get("sentiment") == "positive",
                                playtime_hours=review.get("playtime_hours", 0),
                            )
                            citations.append(citation)
                            if len(citations) >= 5:
                                break
                if len(citations) >= 5:
                    break

            source_reviews = []
            for tc in agent_result.tool_calls_made:
                if tc.get("tool") == "search_reviews":
                    result_data = tc.get("result", {})
                    for review in result_data.get("reviews", []):
                        if review.get("review_id"):
                            citation_app_id = int(tc.get("params", {}).get("app_id") or (app_ids[0] if app_ids else 0))
                            source_review = ChatCitationItem(
                                review_id=str(review.get("review_id", "")),
                                app_id=citation_app_id,
                                game_name=game_names.get(citation_app_id, f"Game {citation_app_id}"),
                                snippet=review.get("text", ""),
                                votes_up=review.get("votes_up", 0),
                                voted_up=review.get("sentiment") == "positive",
                                playtime_hours=review.get("playtime_hours", 0),
                            )
                            source_reviews.append(source_review)

            games_used = game_metadata
            reviews_searched = sum(
                tc.get("result", {}).get("total_found", 0)
                for tc in agent_result.tool_calls_made
                if tc.get("tool") == "search_reviews"
            )
        else:
            conversation_text = ""
            for msg in history:
                role_label = "User" if msg["role"] == "user" else "Assistant"
                conversation_text += f"{role_label}: {msg['content']}\n\n"

            conversation_text += f"User: {message}\n\nAssistant:"

            prompt = f"""You are a helpful, friendly AI assistant. You are having a conversation with a user.
Previous conversation:
{conversation_text if history else 'This is the start of the conversation.'}

Please respond naturally to the user's latest message, considering the conversation history.
If the user asks for a chart/plot/graph, include a fenced code block with language 'chart' containing JSON for Chart.js.
Example:
```chart
{{"type":"bar","title":"Example","data":{{"labels":["A","B"],"datasets":[{{"label":"Value","data":[1,2]}}]}}}}
```
"""

            with llm.llm_usage_context(
                user_id=user_id,
                session_id=session_id,
                operation="chat_simple",
            ):
                response_text, model_id = llm.run_chat_completion(prompt)
            citations = []
            source_reviews = []
            games_used = []
            reviews_searched = 0
            suggested_questions = []
            tool_calls_made = 0

        storage.save_chat_message(user_id, "user", message, session_id=session_id)
        storage.save_chat_message(user_id, "assistant", response_text, session_id=session_id)

        return SimpleChatResponse(
            response=response_text,
            session_id=session_id,
            citations=citations,
            source_reviews=source_reviews,
            games_used=games_used,
            reviews_searched=reviews_searched,
            has_game_context=has_game_context,
            suggested_questions=suggested_questions,
            needs_clarification=False,
            clarification_options=[],
            tool_calls_made=tool_calls_made,
            suggest_search_game=False,
            search_game_name="",
        )
    except Exception as exc:
        logger.exception("Simple chat failed: %s", exc)
        raise HTTPException(status_code=500, detail="Chat request failed.") from exc


@router.get("/chat/sessions", response_model=List[ChatSession])
def get_chat_sessions() -> List[ChatSession]:
    user_id = "local"
    try:
        sessions = storage.get_chat_sessions(user_id)
        return [ChatSession(**session) for session in sessions]
    except Exception as exc:
        logger.exception("Failed to load chat sessions: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load chat sessions.") from exc


@router.get("/chat/history", response_model=List[ChatMessage])
def get_chat_history(session_id: Optional[str] = None) -> List[ChatMessage]:
    user_id = "local"
    try:
        history = storage.load_chat_history(user_id, limit=100, session_id=session_id)
        return [ChatMessage(**msg) for msg in history]
    except Exception as exc:
        logger.exception("Failed to load chat history: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load chat history.") from exc


@router.delete("/chat/history")
def clear_chat_history_endpoint(session_id: Optional[str] = None) -> Dict[str, Any]:
    user_id = "local"
    try:
        count = storage.clear_chat_history(user_id, session_id=session_id)
        return {"deleted": count}
    except Exception as exc:
        logger.exception("Failed to clear chat history: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to clear chat history.") from exc


@router.post("/chat/citation-feedback")
def submit_citation_feedback(request: CitationFeedbackRequest) -> Dict[str, str]:
    user_id = "local"
    try:
        storage.save_citation_feedback(
            user_id=user_id,
            session_id=request.session_id,
            review_id=request.review_id,
            helpful=request.helpful,
        )
        return {"status": "ok"}
    except Exception as exc:
        logger.exception("Failed to save citation feedback: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save feedback.") from exc


@router.get("/chat/export/{session_id}")
def export_chat_session(session_id: str, format: str = "markdown"):
    user_id = "local"
    messages = storage.load_chat_history(user_id, limit=500, session_id=session_id)

    if not messages:
        raise HTTPException(status_code=404, detail="No messages found for this session.")

    if format == "json":
        return JSONResponse(
            content={"session_id": session_id, "messages": messages},
            headers={"Content-Disposition": f"attachment; filename=chat-{session_id}.json"},
        )

    md_lines = [f"# Chat Session {session_id}\n"]
    for msg in messages:
        role_label = "**User**" if msg["role"] == "user" else "**Assistant**"
        timestamp = msg.get("timestamp", "")
        if timestamp:
            md_lines.append(f"{role_label} ({timestamp}):\n")
        else:
            md_lines.append(f"{role_label}:\n")
        md_lines.append(f"{msg['content']}\n\n---\n")

    md_content = "\n".join(md_lines)
    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=chat-{session_id}.md"},
    )


@router.get("/chat/stream/{session_id}")
async def chat_stream(session_id: str):
    async def event_generator():
        last_index = 0
        idle_count = 0
        max_idle = 60

        while True:
            try:
                statuses = _get_chat_status(session_id)

                if len(statuses) > last_index:
                    for status in statuses[last_index:]:
                        yield f"event: status\ndata: {json.dumps({'message': status, 'timestamp': datetime.now(timezone.utc).isoformat() + 'Z'})}\n\n"
                        idle_count = 0
                    last_index = len(statuses)

                if statuses and any("generating" in s.lower() for s in statuses[-3:]):
                    await asyncio.sleep(0.5)
                    if not _get_chat_status(session_id):
                        yield f"event: done\ndata: {json.dumps({'status': 'completed'})}\n\n"
                        return

                idle_count += 1
                if idle_count >= max_idle:
                    yield f"event: timeout\ndata: {json.dumps({'status': 'timeout'})}\n\n"
                    return

                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.warning("Chat SSE stream error: %s", exc)
                yield f"event: error\ndata: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
                return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


