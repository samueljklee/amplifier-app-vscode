"""
Hook utility helpers shared across VS Code server hooks.
"""

from __future__ import annotations

import json
from typing import Any, Dict


def _coerce_dict(candidate: Any) -> dict[str, Any] | None:
    """Attempt to coerce an arbitrary object into a dict."""
    if isinstance(candidate, dict):
        return candidate

    if isinstance(candidate, str):
        candidate = candidate.strip()
        if not candidate:
            return None
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None

    return None


def ensure_tool_input(data: dict[str, Any]) -> dict[str, Any]:
    """
    Return a mutable dict for tool input regardless of how amplifier-core
    structured the event payload. Mutations to the returned dict are reflected
    back into `data` (and `tool_use.{input,arguments}` when present) so downstream
    hooks observe the normalized values.
    """
    possible_keys = ("input", "tool_input", "arguments")
    for key in possible_keys:
        maybe = data.get(key)
        coerced = _coerce_dict(maybe)
        if coerced is not None:
            if key != "input":
                data["input"] = coerced
            return coerced

    tool_use = data.get("tool_use")
    if isinstance(tool_use, dict):
        for key in ("input", "arguments"):
            maybe = tool_use.get(key)
            coerced = _coerce_dict(maybe)
            if coerced is not None:
                data["input"] = coerced
                tool_use[key] = coerced
                return coerced

    # Nothing usable was provided; create a new dict and plumb it everywhere.
    input_ref: Dict[str, Any] = {}
    data["input"] = input_ref
    if isinstance(tool_use, dict):
        tool_use["input"] = input_ref
    return input_ref
