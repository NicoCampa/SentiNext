"""Abstract LLM provider interface."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class LLMProvider(ABC):
    """Abstract LLM provider interface."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system: str | None = None,
        response_schema: dict | None = None,
        temperature: float = 0.0,
    ) -> str:
        """Generate text completion.

        Args:
            prompt: The user prompt.
            system: Optional system instruction.
            response_schema: Optional JSON schema dict for structured output.
            temperature: Sampling temperature.

        Returns:
            Raw text response from the model.
        """
        ...

    @abstractmethod
    def generate_structured(
        self,
        prompt: str,
        response_schema: dict,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        """Generate structured JSON output.

        Args:
            prompt: The user prompt.
            response_schema: JSON schema dict the output must conform to.
            system: Optional system instruction.
            temperature: Sampling temperature.

        Returns:
            Parsed JSON dict from the model.
        """
        ...

    @abstractmethod
    def generate_with_pydantic(
        self,
        prompt: str,
        parse_model: type,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> str:
        """Generate output using a Pydantic model for structured validation.

        Some providers (xAI) support native Pydantic parsing via chat.parse().
        Others should fall back to JSON schema extraction + manual parsing.

        Args:
            prompt: The user prompt.
            parse_model: A Pydantic BaseModel subclass.
            system: Optional system instruction.
            temperature: Sampling temperature.

        Returns:
            Raw JSON string from the model.
        """
        ...

    @abstractmethod
    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        """Generate with tool/function calling support.

        Args:
            messages: Conversation messages (role/content dicts).
            tools: Tool definitions in OpenAI function-calling format.
            system: Optional system instruction.
            temperature: Sampling temperature.

        Returns:
            Dict with 'content' (str|None) and 'tool_calls' (list[dict]).
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name identifier (e.g. 'gemini', 'xai', 'openai', 'ollama')."""
        ...

    @property
    @abstractmethod
    def model(self) -> str:
        """Current model name."""
        ...

    def model_id(self) -> str:
        """Return a stable provider:model identifier string."""
        return f"{self.name}:{self.model}"
