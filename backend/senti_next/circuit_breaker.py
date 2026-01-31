"""Circuit breaker pattern implementation for external API calls."""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, TypeVar, ParamSpec

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation, requests pass through
    OPEN = "open"          # Failing, requests are rejected immediately
    HALF_OPEN = "half_open"  # Testing recovery, limited requests allowed


class CircuitOpenError(Exception):
    """Raised when circuit is open and request is rejected."""
    def __init__(self, name: str, retry_after: float):
        self.name = name
        self.retry_after = retry_after
        super().__init__(f"Circuit '{name}' is open. Retry after {retry_after:.1f}s")


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior."""
    failure_threshold: int = 5      # Failures before opening circuit
    success_threshold: int = 2      # Successes needed to close from half-open
    timeout_seconds: float = 60.0   # Time before transitioning from open to half-open
    half_open_max_calls: int = 1    # Max concurrent calls in half-open state


@dataclass
class CircuitBreaker:
    """Thread-safe circuit breaker for protecting external service calls.

    Usage:
        breaker = CircuitBreaker("steam_api")

        try:
            result = breaker.call(some_function, arg1, arg2)
        except CircuitOpenError:
            # Handle circuit open (return cached data, raise user-friendly error)
            pass
    """
    name: str
    config: CircuitBreakerConfig = field(default_factory=CircuitBreakerConfig)
    _state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False)
    _success_count: int = field(default=0, init=False)
    _last_failure_time: float = field(default=0.0, init=False)
    _half_open_calls: int = field(default=0, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        with self._lock:
            return self._state

    @property
    def is_closed(self) -> bool:
        """Check if circuit is closed (normal operation)."""
        return self.state == CircuitState.CLOSED

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset."""
        return time.time() - self._last_failure_time >= self.config.timeout_seconds

    def _transition_to_open(self) -> None:
        """Transition circuit to open state."""
        self._state = CircuitState.OPEN
        self._success_count = 0
        self._half_open_calls = 0
        logger.warning(
            "Circuit '%s' opened after %d failures",
            self.name, self._failure_count
        )

    def _transition_to_half_open(self) -> None:
        """Transition circuit to half-open state."""
        self._state = CircuitState.HALF_OPEN
        self._half_open_calls = 0
        self._success_count = 0
        logger.info("Circuit '%s' entering half-open state", self.name)

    def _transition_to_closed(self) -> None:
        """Transition circuit to closed state."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        logger.info("Circuit '%s' closed, normal operation resumed", self.name)

    def _on_success(self) -> None:
        """Handle successful call."""
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                self._half_open_calls = max(0, self._half_open_calls - 1)
                if self._success_count >= self.config.success_threshold:
                    self._transition_to_closed()
            elif self._state == CircuitState.CLOSED:
                # Reset failure count on success
                self._failure_count = 0

    def _on_failure(self) -> None:
        """Handle failed call."""
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open goes back to open
                self._transition_to_open()
            elif self._state == CircuitState.CLOSED:
                if self._failure_count >= self.config.failure_threshold:
                    self._transition_to_open()

    def call(self, func: Callable[P, T], *args: P.args, **kwargs: P.kwargs) -> T:
        """Execute function with circuit breaker protection.

        Args:
            func: Function to call
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Result from func

        Raises:
            CircuitOpenError: If circuit is open
            Exception: Any exception raised by func
        """
        with self._lock:
            if self._state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self._transition_to_half_open()
                else:
                    retry_after = self.config.timeout_seconds - (time.time() - self._last_failure_time)
                    raise CircuitOpenError(self.name, max(0, retry_after))

            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.config.half_open_max_calls:
                    retry_after = 1.0  # Brief wait for ongoing half-open call
                    raise CircuitOpenError(self.name, retry_after)
                self._half_open_calls += 1

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise

    def reset(self) -> None:
        """Manually reset circuit to closed state."""
        with self._lock:
            self._transition_to_closed()
            logger.info("Circuit '%s' manually reset", self.name)

    def get_stats(self) -> dict:
        """Get current circuit breaker statistics."""
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "failure_count": self._failure_count,
                "success_count": self._success_count,
                "last_failure_time": self._last_failure_time,
                "config": {
                    "failure_threshold": self.config.failure_threshold,
                    "success_threshold": self.config.success_threshold,
                    "timeout_seconds": self.config.timeout_seconds,
                },
            }


# Pre-configured circuit breakers for external services
steam_api_breaker = CircuitBreaker(
    "steam_api",
    CircuitBreakerConfig(
        failure_threshold=5,
        success_threshold=2,
        timeout_seconds=60.0,
    ),
)
