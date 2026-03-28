"""Tests for confluence_push.py"""

from __future__ import annotations

import json
import urllib.error
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock

import pytest

from confluence_push import (
    api_get,
    api_put,
    build_update_payload,
    load_secrets,
    main,
    push_page,
)


# ---------------------------------------------------------------------------
# load_secrets
# ---------------------------------------------------------------------------


class TestLoadSecrets:
    def test_load_secrets_when_valid_file_returns_dict(self, tmp_path: Path):
        # Arrange
        env_file = tmp_path / ".secrets.env"
        env_file.write_text(
            "CONFLUENCE_URL=https://wiki.example.com\n"
            "CONFLUENCE_PERSONAL_TOKEN=secret123\n",
            encoding="utf-8",
        )

        # Act
        result = load_secrets(env_file)

        # Assert
        assert result == {
            "CONFLUENCE_URL": "https://wiki.example.com",
            "CONFLUENCE_PERSONAL_TOKEN": "secret123",
        }

    def test_load_secrets_when_comments_and_blanks_skips_them(self):
        # Arrange
        content = "# comment\n\nKEY=value\n  \n# another\nKEY2=val2\n"
        file_reader = Mock(return_value=content)

        # Act
        result = load_secrets(Path("/fake"), file_reader=file_reader)

        # Assert
        assert result == {"KEY": "value", "KEY2": "val2"}

    def test_load_secrets_when_value_contains_equals_preserves_it(self):
        # Arrange
        content = "TOKEN=abc=def=ghi\n"
        file_reader = Mock(return_value=content)

        # Act
        result = load_secrets(Path("/fake"), file_reader=file_reader)

        # Assert
        assert result["TOKEN"] == "abc=def=ghi"

    def test_load_secrets_when_file_missing_raises(self, tmp_path: Path):
        # Arrange
        missing = tmp_path / "nope.env"

        # Act & Assert
        with pytest.raises(FileNotFoundError):
            load_secrets(missing)

    def test_load_secrets_when_empty_file_returns_empty(self):
        # Arrange
        file_reader = Mock(return_value="")

        # Act
        result = load_secrets(Path("/fake"), file_reader=file_reader)

        # Assert
        assert result == {}


# ---------------------------------------------------------------------------
# api_get
# ---------------------------------------------------------------------------


class TestApiGet:
    def test_api_get_when_success_returns_json(self):
        # Arrange
        expected = {"version": {"number": 5}, "title": "Test"}
        http_caller = Mock(return_value=expected)

        # Act
        result = api_get("https://wiki.example.com/rest/api/content/123", "tok", http_caller=http_caller)

        # Assert
        assert result == expected
        req = http_caller.call_args[0][0]
        assert req.get_header("Authorization") == "Bearer tok"
        assert req.get_header("Accept") == "application/json"
        assert req.get_method() == "GET"

    def test_api_get_when_http_error_propagates(self):
        # Arrange
        http_caller = Mock(side_effect=urllib.error.HTTPError(
            "https://example.com", 404, "Not Found", {}, BytesIO(b"nope"),
        ))

        # Act & Assert
        with pytest.raises(urllib.error.HTTPError) as exc:
            api_get("https://example.com", "tok", http_caller=http_caller)
        assert exc.value.code == 404


# ---------------------------------------------------------------------------
# api_put
# ---------------------------------------------------------------------------


class TestApiPut:
    def test_api_put_when_success_returns_json(self):
        # Arrange
        expected = {"version": {"number": 6}}
        http_caller = Mock(return_value=expected)
        payload = {"id": "123", "body": {"storage": {"value": "<p>hi</p>"}}}

        # Act
        result = api_put("https://wiki.example.com/rest/api/content/123", "tok", payload, http_caller=http_caller)

        # Assert
        assert result == expected
        req = http_caller.call_args[0][0]
        assert req.get_method() == "PUT"
        assert req.get_header("Content-type") == "application/json"
        sent_data = json.loads(req.data.decode("utf-8"))
        assert sent_data["id"] == "123"

    def test_api_put_when_http_error_propagates(self):
        # Arrange
        http_caller = Mock(side_effect=urllib.error.HTTPError(
            "https://example.com", 409, "Conflict", {}, BytesIO(b"version mismatch"),
        ))

        # Act & Assert
        with pytest.raises(urllib.error.HTTPError) as exc:
            api_put("https://example.com", "tok", {}, http_caller=http_caller)
        assert exc.value.code == 409


# ---------------------------------------------------------------------------
# build_update_payload
# ---------------------------------------------------------------------------


class TestBuildUpdatePayload:
    def test_build_update_payload_when_no_comment_omits_message(self):
        # Arrange / Act
        result = build_update_payload("42", "My Page", "<p>hello</p>", 10)

        # Assert
        assert result["id"] == "42"
        assert result["title"] == "My Page"
        assert result["body"]["storage"]["value"] == "<p>hello</p>"
        assert result["version"]["number"] == 10
        assert "message" not in result["version"]

    def test_build_update_payload_when_comment_includes_message(self):
        # Arrange / Act
        result = build_update_payload("42", "My Page", "<p>hi</p>", 5, "added column")

        # Assert
        assert result["version"]["message"] == "added column"
        assert result["version"]["number"] == 5


# ---------------------------------------------------------------------------
# push_page
# ---------------------------------------------------------------------------


class TestPushPage:
    def test_push_page_when_success_returns_new_version(self):
        # Arrange
        get_response = {"version": {"number": 10}, "title": "App Catalog"}
        put_response = {"version": {"number": 11}}

        def fake_http(req):
            if req.get_method() == "GET":
                return get_response
            return put_response

        # Act
        new_ver = push_page(
            "198590210",
            "<p>new content</p>",
            "https://wiki.example.com",
            "tok",
            "test edit",
            http_caller=fake_http,
        )

        # Assert
        assert new_ver == 11

    def test_push_page_when_get_fails_propagates_error(self):
        # Arrange
        http_caller = Mock(side_effect=urllib.error.HTTPError(
            "https://example.com", 403, "Forbidden", {}, BytesIO(b"denied"),
        ))

        # Act & Assert
        with pytest.raises(urllib.error.HTTPError) as exc:
            push_page("123", "<p>x</p>", "https://example.com", "tok", http_caller=http_caller)
        assert exc.value.code == 403

    def test_push_page_when_put_fails_propagates_error(self):
        # Arrange
        call_count = 0

        def fake_http(req):
            nonlocal call_count
            call_count += 1
            if req.get_method() == "GET":
                return {"version": {"number": 5}, "title": "X"}
            raise urllib.error.HTTPError(
                "https://example.com", 409, "Conflict", {}, BytesIO(b"stale"),
            )

        # Act & Assert
        with pytest.raises(urllib.error.HTTPError) as exc:
            push_page("123", "<p>x</p>", "https://example.com", "tok", http_caller=fake_http)
        assert exc.value.code == 409
        assert call_count == 2


# ---------------------------------------------------------------------------
# main (CLI integration)
# ---------------------------------------------------------------------------


class TestMain:
    def test_main_when_success_returns_zero(self, tmp_path: Path, monkeypatch):
        # Arrange
        html_file = tmp_path / "page.html"
        html_file.write_text("<p>hello</p>", encoding="utf-8")

        env_file = tmp_path / ".env"
        env_file.write_text(
            "CONFLUENCE_URL=https://wiki.example.com\n"
            "CONFLUENCE_PERSONAL_TOKEN=tok\n",
            encoding="utf-8",
        )

        def fake_push_page(page_id, html, base_url, token, comment):
            assert page_id == "42"
            assert html == "<p>hello</p>"
            assert base_url == "https://wiki.example.com"
            return 2

        monkeypatch.setattr("confluence_push.push_page", fake_push_page)

        # Act
        result = main([
            "42", str(html_file),
            "--env-file", str(env_file),
            "--comment", "test edit",
        ])

        # Assert
        assert result == 0

    def test_main_when_html_file_missing_returns_one(self, tmp_path: Path):
        # Arrange
        env_file = tmp_path / ".env"
        env_file.write_text(
            "CONFLUENCE_URL=https://wiki.example.com\n"
            "CONFLUENCE_PERSONAL_TOKEN=tok\n",
            encoding="utf-8",
        )

        # Act
        result = main(["123", str(tmp_path / "nonexistent.html"), "--env-file", str(env_file)])

        # Assert
        assert result == 1

    def test_main_when_missing_credentials_returns_one(self, tmp_path: Path):
        # Arrange
        html_file = tmp_path / "page.html"
        html_file.write_text("<p>hello</p>", encoding="utf-8")

        env_file = tmp_path / ".env"
        env_file.write_text("SOME_OTHER_KEY=value\n", encoding="utf-8")

        # Act
        result = main(["123", str(html_file), "--env-file", str(env_file)])

        # Assert
        assert result == 1

    def test_main_when_no_args_returns_error(self):
        # Arrange / Act & Assert
        with pytest.raises(SystemExit) as exc:
            main([])
        assert exc.value.code == 2  # argparse exits with 2 on missing required args
