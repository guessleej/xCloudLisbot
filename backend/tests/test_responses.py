"""Tests for response helpers."""

import json
from unittest.mock import MagicMock
from shared.responses import cors_headers, json_response, error_response


def _mock_request(origin="http://localhost:3000"):
    req = MagicMock()
    req.headers = {"Origin": origin}
    return req


def test_cors_headers_allowed_origin():
    req = _mock_request("http://localhost:3000")
    headers = cors_headers(req)
    assert headers["Access-Control-Allow-Origin"] == "http://localhost:3000"
    assert "GET" in headers["Access-Control-Allow-Methods"]


def test_json_response_structure():
    req = _mock_request()
    resp = json_response({"key": "value"}, 200, req)
    assert resp.status_code == 200
    body = json.loads(resp.get_body())
    assert body["key"] == "value"


def test_error_response():
    req = _mock_request()
    resp = error_response("Something went wrong", 400, req)
    assert resp.status_code == 400
    body = json.loads(resp.get_body())
    assert body["error"] == "Something went wrong"


def test_json_response_no_request():
    resp = json_response({"test": True})
    assert resp.status_code == 200
    body = json.loads(resp.get_body())
    assert body["test"] is True
