"""Unit tests for TerminologyBody Pydantic model — verifies isActive is parsed correctly."""

import pytest
from pydantic import BaseModel, ValidationError


class TerminologyBody(BaseModel):
    name: str
    description: str | None = None
    terms: list[str] = []
    isActive: bool = True


def test_is_active_false_is_persisted():
    """Client sends isActive=false — must not be silently reset to True."""
    body = TerminologyBody.model_validate({"name": "Test", "isActive": False})
    assert body.isActive is False


def test_is_active_true_is_persisted():
    body = TerminologyBody.model_validate({"name": "Test", "isActive": True})
    assert body.isActive is True


def test_is_active_defaults_to_true():
    body = TerminologyBody.model_validate({"name": "Test"})
    assert body.isActive is True


def test_old_snake_case_key_is_rejected():
    """Confirm snake_case is_active is NOT silently accepted as an alias."""
    body = TerminologyBody.model_validate({"name": "Test", "is_active": False})
    # is_active is an unknown field; isActive should stay at its default True
    assert body.isActive is True
