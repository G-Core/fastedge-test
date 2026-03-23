from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

_SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
_TRAILER_PATTERNS = {
    "method": re.compile(r"^Method:\s*(.+)$", re.IGNORECASE),
    "agent": re.compile(r"^Agent:\s*(.+)$", re.IGNORECASE),
    "co_authored_by": re.compile(r"^Co-authored-by:\s*(.+)$", re.IGNORECASE),
    "refs": re.compile(r"^Refs:\s*(.+)$", re.IGNORECASE),
    "closes": re.compile(r"^Closes:\s*(.+)$", re.IGNORECASE),
}
_MANAGED_TREE_MAPPINGS = {
    "commands": ".toolkit/claude/commands",
    "hooks": ".toolkit/claude/hooks",
    "rules": ".toolkit/claude/rules",
    "skills": ".toolkit/claude/skills",
}
_MANAGED_FILE_MAPPINGS = {
    "AGENTS.md": ".toolkit/AGENTS.md",
    "CLAUDE.md": ".toolkit/CLAUDE.md",
    "DOCS.md": ".toolkit/DOCS.md",
    "DOCS.md.EXAMPLE": ".toolkit/DOCS.md.EXAMPLE",
}
_BOOTSTRAP_FILES = ["AGENTS.md", "CLAUDE.md", "DOCS.md"]
_TARGET_RUNTIME_FILES = [
    ".github/workflows/doctor.yml",
    ".github/workflows/collect.py",
    ".github/workflows/doctor-analyze.md",
    ".github/workflows/doctor-analyze.lock.yml",
]
_OBSERVED_PATHS = [
    ".specify/",
    "specs/",
    "docs/",
    "docs/quickstart.md",
    "docs/INDEX.md",
    ".specify/memory/constitution.md",
    ".toolkit/workflows/docs/",
    *_TARGET_RUNTIME_FILES,
    ".gitignore",
]
_REQUIRED_GITIGNORE_RULES = [".codex", ".claude", ".specify", "specs/*"]


def _parse_semver(value: str) -> tuple[int, int, int] | None:
    match = _SEMVER_RE.match(value.strip())
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def _format_semver(version_tuple: tuple[int, int, int]) -> str:
    major, minor, patch = version_tuple
    return f"v{major}.{minor}.{patch}"


def _normalize_tag(value: str) -> str | None:
    parsed = _parse_semver(value)
    if parsed is None:
        return None
    return _format_semver(parsed)


def _path_to_id(path: str) -> str:
    return path.strip("./").replace("/", "_").replace(".", "_")


def _path_exists(repo_root: Path, relative_path: str) -> bool:
    candidate = repo_root / relative_path
    if relative_path.endswith("/"):
        return candidate.is_dir()
    return candidate.exists()


def _read_gitignore_rules(repo_root: Path) -> set[str]:
    gitignore_path = repo_root / ".gitignore"
    if not gitignore_path.exists():
        return set()

    raw_rules = [line.strip() for line in gitignore_path.read_text(encoding="utf-8").splitlines()]
    return {line for line in raw_rules if line and not line.startswith("#")}


def _new_finding(
    finding_id: str,
    *,
    category: str,
    severity: str,
    path: str | None,
    state: str,
    auto_action: str,
    message: str,
    expected: str | None = None,
    actual: str | None = None,
) -> dict[str, Any]:
    return {
        "id": finding_id,
        "category": category,
        "severity": severity,
        "path": path,
        "state": state,
        "expected": expected,
        "actual": actual,
        "auto_action": auto_action,
        "message": message,
    }


def _read_installed_version(repo_root: Path) -> tuple[str | None, tuple[int, int, int] | None, bool]:
    version_path = repo_root / ".toolkit" / "VERSION"
    if not version_path.exists():
        return None, None, False

    raw = version_path.read_text(encoding="utf-8").strip()
    parsed = _parse_semver(raw)
    if parsed is None:
        return raw, None, True

    return _format_semver(parsed), parsed, False


def _resolve_latest(tags: Iterable[str]) -> tuple[str, tuple[int, int, int]] | None:
    parsed: list[tuple[tuple[int, int, int], str]] = []
    for tag in tags:
        semver = _parse_semver(tag)
        if semver is not None:
            parsed.append((semver, tag))

    if not parsed:
        return None

    highest = max(parsed, key=lambda item: item[0])
    return _format_semver(highest[0]), highest[0]


def _resolve_latest_compatible(
    tags: Iterable[str],
    installed: tuple[int, int, int],
) -> tuple[str, tuple[int, int, int]] | None:
    installed_major, installed_minor, _ = installed

    compatible: list[tuple[tuple[int, int, int], str]] = []
    for tag in tags:
        semver = _parse_semver(tag)
        if semver is None:
            continue

        major, minor, _patch = semver
        if installed_major >= 1:
            if major == installed_major:
                compatible.append((semver, tag))
        else:
            if major == installed_major and minor == installed_minor:
                compatible.append((semver, tag))

    if not compatible:
        return None

    highest = max(compatible, key=lambda item: item[0])
    return _format_semver(highest[0]), highest[0]


def build_expected_manifest_stub() -> dict[str, Any]:
    return {
        "managed_files": {},
        "reference_files": {},
        "bootstrap_files": list(_BOOTSTRAP_FILES),
        "observed_paths": list(_OBSERVED_PATHS),
        "required_gitignore_rules": list(_REQUIRED_GITIGNORE_RULES),
    }


def build_expected_manifest_from_source(
    *,
    source_root: Path,
    resolved_version: str,
) -> dict[str, Any]:
    source_root = Path(source_root)
    managed_files: dict[str, str] = {}
    reference_files: dict[str, str] = {}

    for source_relative, target_relative in _MANAGED_TREE_MAPPINGS.items():
        source_dir = source_root / source_relative
        if not source_dir.exists():
            continue

        for source_file in sorted(candidate for candidate in source_dir.rglob("*") if candidate.is_file()):
            relative_path = source_file.relative_to(source_dir).as_posix()
            managed_files[f"{target_relative}/{relative_path}"] = source_file.read_text(
                encoding="utf-8"
            )

    for source_relative, target_relative in _MANAGED_FILE_MAPPINGS.items():
        source_file = source_root / source_relative
        if source_file.exists():
            managed_files[target_relative] = source_file.read_text(encoding="utf-8")

    workflows_root = source_root / "workflows"
    if workflows_root.exists():
        for source_file in sorted(candidate for candidate in workflows_root.rglob("*") if candidate.is_file()):
            relative_path = source_file.relative_to(workflows_root).as_posix()
            reference_files[f".toolkit/workflows/{relative_path}"] = source_file.read_text(
                encoding="utf-8"
            )

    managed_files[".toolkit/VERSION"] = f"{resolved_version}\n"

    return {
        "managed_files": managed_files,
        "reference_files": reference_files,
        "bootstrap_files": list(_BOOTSTRAP_FILES),
        "observed_paths": list(_OBSERVED_PATHS),
        "required_gitignore_rules": list(_REQUIRED_GITIGNORE_RULES),
    }


def build_compliance_checks(
    *,
    repo_root: Path,
    required_gitignore_rules: list[str],
) -> dict[str, dict[str, bool]]:
    repo_root = Path(repo_root)
    gitignore_rules = _read_gitignore_rules(repo_root)
    required_rules = set(required_gitignore_rules)

    return {
        "bootstrap": {
            "agents_present": (repo_root / "AGENTS.md").exists(),
            "claude_present": (repo_root / "CLAUDE.md").exists(),
            "docs_md_present": (repo_root / "DOCS.md").exists(),
        },
        "agent_workspace": {
            "specify_dir_present": (repo_root / ".specify").is_dir(),
            "constitution_present": (repo_root / ".specify" / "memory" / "constitution.md").exists(),
            "specs_dir_present": (repo_root / "specs").is_dir(),
        },
        "docs": {
            "docs_dir_present": (repo_root / "docs").is_dir(),
            "index_present": (repo_root / "docs" / "INDEX.md").exists(),
            "quickstart_present": (repo_root / "docs" / "quickstart.md").exists(),
        },
        "toolkit": {
            "root_present": (repo_root / ".toolkit").is_dir(),
            "version_present": (repo_root / ".toolkit" / "VERSION").exists(),
            "workflow_docs_present": (repo_root / ".toolkit" / "workflows" / "docs").is_dir(),
        },
        "policy": {
            "gitignore_has_codex_rule": ".codex" in required_rules and ".codex" in gitignore_rules,
            "gitignore_has_claude_rule": ".claude" in required_rules and ".claude" in gitignore_rules,
            "gitignore_has_specify_rule": ".specify" in required_rules and ".specify" in gitignore_rules,
            "gitignore_has_specs_glob": "specs/*" in required_rules and "specs/*" in gitignore_rules,
            "constitution_not_ignored": ".specify/memory/constitution.md" not in gitignore_rules,
        },
        "doctor_runtime": {
            "doctor_yml_present": (repo_root / ".github" / "workflows" / "doctor.yml").exists(),
            "collect_py_present": (repo_root / ".github" / "workflows" / "collect.py").exists(),
            "analyze_md_present": (repo_root / ".github" / "workflows" / "doctor-analyze.md").exists(),
            "analyze_lock_present": (
                repo_root / ".github" / "workflows" / "doctor-analyze.lock.yml"
            ).exists(),
        },
    }


def _source_tag_unavailable_finding(requested_tag: str | None = None) -> dict[str, Any]:
    message = "No valid source tags are available"
    if requested_tag:
        message = f"Requested source tag is unavailable: {requested_tag}"

    return _new_finding(
        "operational.source_version_unavailable",
        category="operational",
        severity="error",
        path=None,
        state="source_version_unavailable",
        auto_action="none",
        message=message,
        actual=requested_tag,
    )


def resolve_version_state(
    *,
    repo_root: Path,
    target_version: str | None,
    source_tags: list[str],
    allow_breaking_update: bool,
) -> dict[str, Any]:
    repo_root = Path(repo_root)
    findings: list[dict[str, Any]] = []

    installed_version, installed_tuple, invalid_installed_version = _read_installed_version(repo_root)
    latest_overall = _resolve_latest(source_tags)
    latest_tag = latest_overall[0] if latest_overall is not None else None
    normalized_source_tags = {
        normalized
        for tag in source_tags
        if (normalized := _normalize_tag(tag)) is not None
    }

    if invalid_installed_version:
        findings.append(
            _new_finding(
                "operational.invalid_version",
                category="operational",
                severity="error",
                path=".toolkit/VERSION",
                state="invalid_version",
                auto_action="none",
                message=".toolkit/VERSION is not a valid semantic version",
                actual=installed_version,
            )
        )

    if target_version:
        requested_target = target_version.strip()
        normalized_target = _normalize_tag(requested_target)
        if normalized_target is None or normalized_target not in normalized_source_tags:
            findings.append(_source_tag_unavailable_finding(normalized_target or requested_target))
            return {
                "installed_version": installed_version,
                "resolved_version": normalized_target or requested_target,
                "resolved_from": "workflow_input",
                "compatibility_blocked": False,
                "latest_tag": latest_tag,
                "should_act": False,
                "act_reason": "operational_error",
                "fatal_error": True,
                "findings": findings,
            }

        should_act = bool(installed_version is None or installed_version != normalized_target)
        act_reason = "version_outdated" if should_act else "healthy"

        return {
            "installed_version": installed_version,
            "resolved_version": normalized_target,
            "resolved_from": "workflow_input",
            "compatibility_blocked": False,
            "latest_tag": latest_tag,
            "should_act": should_act,
            "act_reason": act_reason,
            "fatal_error": False,
            "findings": findings,
        }

    if latest_overall is None:
        findings.append(_source_tag_unavailable_finding())
        return {
            "installed_version": installed_version,
            "resolved_version": installed_version,
            "resolved_from": "installed_version" if installed_version else None,
            "compatibility_blocked": False,
            "latest_tag": None,
            "should_act": False,
            "act_reason": "operational_error",
            "fatal_error": True,
            "findings": findings,
        }

    latest_overall_version, latest_overall_tuple = latest_overall

    if invalid_installed_version:
        return {
            "installed_version": installed_version,
            "resolved_version": latest_overall_version,
            "resolved_from": "latest_compatible_tag",
            "compatibility_blocked": False,
            "latest_tag": latest_tag,
            "should_act": False,
            "act_reason": "operational_error",
            "fatal_error": False,
            "findings": findings,
        }

    if installed_tuple is None:
        return {
            "installed_version": None,
            "resolved_version": latest_overall_version,
            "resolved_from": "latest_compatible_tag",
            "compatibility_blocked": False,
            "latest_tag": latest_tag,
            "should_act": True,
            "act_reason": "version_missing",
            "fatal_error": False,
            "findings": findings,
        }

    if allow_breaking_update:
        resolved_version = latest_overall_version
        resolved_tuple = latest_overall_tuple
        compatibility_blocked = False
    else:
        latest_compatible = _resolve_latest_compatible(source_tags, installed_tuple)
        if latest_compatible is None:
            resolved_version = _format_semver(installed_tuple)
            resolved_tuple = installed_tuple
            compatibility_blocked = latest_overall_tuple > installed_tuple
        else:
            resolved_version, resolved_tuple = latest_compatible
            compatibility_blocked = latest_overall_tuple > resolved_tuple

    if compatibility_blocked and resolved_tuple == installed_tuple:
        should_act = False
        act_reason = "breaking_update_blocked"
    elif resolved_tuple > installed_tuple:
        should_act = True
        act_reason = "version_outdated"
    else:
        should_act = False
        act_reason = "healthy"

    return {
        "installed_version": _format_semver(installed_tuple),
        "resolved_version": resolved_version,
        "resolved_from": "latest_compatible_tag",
        "compatibility_blocked": compatibility_blocked,
        "latest_tag": latest_tag,
        "should_act": should_act,
        "act_reason": act_reason,
        "fatal_error": False,
        "findings": findings,
    }


def _iter_relative_files(repo_root: Path, subtree_root: str) -> set[str]:
    root = repo_root / subtree_root
    if not root.exists():
        return set()

    files: set[str] = set()
    for candidate in root.rglob("*"):
        if candidate.is_file():
            files.add(candidate.relative_to(repo_root).as_posix())
    return files


def _managed_subtree_roots(paths: Iterable[str]) -> set[str]:
    roots: set[str] = set()
    for relative_path in paths:
        path = Path(relative_path)
        parts = path.parts
        if len(parts) >= 4 and parts[0] == ".toolkit" and parts[1] == "claude":
            roots.add(Path(*parts[:3]).as_posix())
    return roots


def _reference_subtree_roots(paths: Iterable[str]) -> set[str]:
    roots: set[str] = set()
    for relative_path in paths:
        path = Path(relative_path)
        parts = path.parts
        if len(parts) >= 3 and parts[0] == ".toolkit" and parts[1] == "workflows":
            roots.add(Path(*parts[:2]).as_posix())
    return roots


def scan_repository_files(*, repo_root: Path, expected_manifest: dict[str, Any]) -> dict[str, Any]:
    repo_root = Path(repo_root)
    findings: list[dict[str, Any]] = []

    managed_files: dict[str, str] = expected_manifest.get("managed_files", {})
    reference_files: dict[str, str] = expected_manifest.get("reference_files", {})
    bootstrap_files: list[str] = expected_manifest.get("bootstrap_files", [])
    observed_paths: list[str] = expected_manifest.get("observed_paths", [])
    required_gitignore_rules: list[str] = expected_manifest.get("required_gitignore_rules", [])
    checks = build_compliance_checks(
        repo_root=repo_root,
        required_gitignore_rules=required_gitignore_rules,
    )

    for relative_path, expected_content in managed_files.items():
        file_path = repo_root / relative_path
        if not file_path.exists():
            findings.append(
                _new_finding(
                    f"managed.{_path_to_id(relative_path)}.missing",
                    category="managed",
                    severity="error",
                    path=relative_path,
                    state="missing",
                    auto_action="act",
                    message=f"Managed path is missing: {relative_path}",
                    expected=expected_content,
                    actual=None,
                )
            )
            continue

        actual_content = file_path.read_text(encoding="utf-8").rstrip("\n")
        if actual_content != str(expected_content).rstrip("\n"):
            findings.append(
                _new_finding(
                    f"managed.{_path_to_id(relative_path)}.changed",
                    category="managed",
                    severity="warning",
                    path=relative_path,
                    state="changed",
                    auto_action="act",
                    message=f"Managed path content differs: {relative_path}",
                    expected=str(expected_content),
                    actual=actual_content,
                )
            )

    managed_expected_paths = set(managed_files)
    for subtree_root in sorted(_managed_subtree_roots(managed_expected_paths)):
        for actual_path in sorted(_iter_relative_files(repo_root, subtree_root) - managed_expected_paths):
            findings.append(
                _new_finding(
                    f"managed.{_path_to_id(actual_path)}.unexpected_extra",
                    category="managed",
                    severity="warning",
                    path=actual_path,
                    state="unexpected_extra",
                    auto_action="act",
                    message=f"Unexpected extra managed path present: {actual_path}",
                )
            )

    for relative_path, expected_content in reference_files.items():
        file_path = repo_root / relative_path
        if not file_path.exists():
            findings.append(
                _new_finding(
                    f"reference.{_path_to_id(relative_path)}.missing",
                    category="reference",
                    severity="error",
                    path=relative_path,
                    state="missing",
                    auto_action="act",
                    message=f"Reference-only bundle path is missing: {relative_path}",
                    expected=expected_content,
                    actual=None,
                )
            )
            continue

        actual_content = file_path.read_text(encoding="utf-8").rstrip("\n")
        if actual_content != str(expected_content).rstrip("\n"):
            findings.append(
                _new_finding(
                    f"reference.{_path_to_id(relative_path)}.changed",
                    category="reference",
                    severity="warning",
                    path=relative_path,
                    state="changed",
                    auto_action="act",
                    message=f"Reference-only bundle path content differs: {relative_path}",
                    expected=str(expected_content),
                    actual=actual_content,
                )
            )

    reference_expected_paths = set(reference_files)
    for subtree_root in sorted(_reference_subtree_roots(reference_expected_paths)):
        for actual_path in sorted(_iter_relative_files(repo_root, subtree_root) - reference_expected_paths):
            findings.append(
                _new_finding(
                    f"reference.{_path_to_id(actual_path)}.unexpected_extra",
                    category="reference",
                    severity="warning",
                    path=actual_path,
                    state="unexpected_extra",
                    auto_action="act",
                    message=f"Unexpected extra reference-only path present: {actual_path}",
                )
            )

    marker = "Managed-by: agent-toolkit-doctor"
    for relative_path in bootstrap_files:
        file_path = repo_root / relative_path
        if not file_path.exists():
            findings.append(
                _new_finding(
                    f"bootstrap.{_path_to_id(relative_path)}.missing",
                    category="bootstrap",
                    severity="warning",
                    path=relative_path,
                    state="missing",
                    auto_action="act",
                    message=f"Bootstrap file is missing: {relative_path}",
                )
            )
            continue

        content = file_path.read_text(encoding="utf-8")
        if marker in content:
            findings.append(
                _new_finding(
                    f"bootstrap.{_path_to_id(relative_path)}.managed_by_marker",
                    category="bootstrap",
                    severity="info",
                    path=relative_path,
                    state="managed_by_marker",
                    auto_action="act",
                    message=f"Bootstrap file is marker-managed: {relative_path}",
                )
            )
        else:
            findings.append(
                _new_finding(
                    f"bootstrap.{_path_to_id(relative_path)}.local_owned",
                    category="bootstrap",
                    severity="info",
                    path=relative_path,
                    state="local_owned",
                    auto_action="none",
                    message=f"Bootstrap file is local-owned: {relative_path}",
                )
            )

    for observed_path in observed_paths:
        if observed_path == ".gitignore":
            continue

        if not _path_exists(repo_root, observed_path):
            findings.append(
                _new_finding(
                    f"observed.{_path_to_id(observed_path)}.missing",
                    category="observed",
                    severity="warning",
                    path=observed_path,
                    state="missing",
                    auto_action="analyze",
                    message=f"Observed-only path is missing: {observed_path}",
                )
            )

    gitignore_path = repo_root / ".gitignore"
    if not gitignore_path.exists():
        findings.append(
            _new_finding(
                "observed.gitignore.missing",
                category="observed",
                severity="warning",
                path=".gitignore",
                state="missing",
                auto_action="analyze",
                message=".gitignore is missing",
            )
        )
    else:
        rules = _read_gitignore_rules(repo_root)

        for required_rule in required_gitignore_rules:
            if required_rule not in rules:
                findings.append(
                    _new_finding(
                        f"observed.gitignore.policy_violation.{_path_to_id(required_rule)}",
                        category="observed",
                        severity="warning",
                        path=".gitignore",
                        state="policy_violation",
                        auto_action="analyze",
                        message=f"Required .gitignore rule is missing: {required_rule}",
                        expected=required_rule,
                        actual=None,
                    )
                )

        forbidden_rule = ".specify/memory/constitution.md"
        if forbidden_rule in rules:
            findings.append(
                _new_finding(
                    "observed.gitignore.policy_violation.constitution_ignored",
                    category="observed",
                    severity="warning",
                    path=".gitignore",
                    state="policy_violation",
                    auto_action="analyze",
                    message="Forbidden .gitignore rule present for constitution file",
                    expected=None,
                    actual=forbidden_rule,
                )
            )

    return {
        "checks": checks,
        "findings": findings,
        "managed_drift_present": any(item["category"] == "managed" for item in findings),
        "reference_bundle_drift_present": any(item["category"] == "reference" for item in findings),
        "bootstrap_missing_present": any(
            item["category"] == "bootstrap" and item["state"] == "missing" for item in findings
        ),
        "observed_findings_present": any(item["category"] == "observed" for item in findings),
    }


def select_act_reason(flags: dict[str, bool]) -> str:
    priority = [
        "toolkit_missing",
        "version_missing",
        "version_outdated",
        "managed_drift",
        "reference_bundle_drift",
        "bootstrap_missing",
    ]

    for reason in priority:
        if flags.get(reason, False):
            return reason
    if flags.get("operational_error", False):
        return "operational_error"
    if flags.get("breaking_update_blocked", False):
        return "breaking_update_blocked"
    return "healthy"


def enrich_commit_record_with_trailers(commit_payload: dict[str, Any]) -> dict[str, Any]:
    message = str(commit_payload.get("message", ""))
    parse_message = message.replace("\\n", "\n")

    method: str | None = None
    agent: str | None = None
    co_authored_by: list[str] = []
    refs: list[str] = []
    closes: list[str] = []

    for line in parse_message.splitlines():
        line = line.strip()
        if not line:
            continue

        method_match = _TRAILER_PATTERNS["method"].match(line)
        if method_match:
            method = method_match.group(1).strip()
            continue

        agent_match = _TRAILER_PATTERNS["agent"].match(line)
        if agent_match:
            agent = agent_match.group(1).strip()
            continue

        co_author_match = _TRAILER_PATTERNS["co_authored_by"].match(line)
        if co_author_match:
            co_authored_by.append(co_author_match.group(1).strip())
            continue

        refs_match = _TRAILER_PATTERNS["refs"].match(line)
        if refs_match:
            refs.append(refs_match.group(1).strip())
            continue

        closes_match = _TRAILER_PATTERNS["closes"].match(line)
        if closes_match:
            closes.append(closes_match.group(1).strip())
            continue

    return {
        "sha": commit_payload.get("sha"),
        "author": commit_payload.get("author"),
        "authored_at": commit_payload.get("authored_at"),
        "message": message,
        "method": method,
        "agent": agent,
        "co_authored_by": co_authored_by,
        "refs": refs,
        "closes": closes,
    }


def build_activity_sections(
    *,
    daily_commits: list[dict[str, Any]],
    daily_prs: list[dict[str, Any]],
    daily_issues: list[dict[str, Any]],
    snapshot_prs: list[dict[str, Any]],
    snapshot_issues: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "activity": {
            "commits": list(daily_commits),
            "prs": list(daily_prs),
            "issues": list(daily_issues),
        },
        "snapshot": {
            "prs": list(snapshot_prs),
            "issues": list(snapshot_issues),
        },
    }


def _build_environment_findings(*, issues_enabled: bool) -> list[dict[str, Any]]:
    if issues_enabled:
        return []

    return [
        _new_finding(
            "operational.issues_disabled",
            category="operational",
            severity="warning",
            path=None,
            state="issues_disabled",
            auto_action="none",
            message="Issues are disabled in the target repository",
        )
    ]


def _stringify_bool(value: bool) -> str:
    return "true" if value else "false"


def _parse_bool(value: str | bool | None, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _rfc3339_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _default_window(report_date: str) -> tuple[str, str]:
    report_start = datetime.strptime(report_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    window_from = report_start - timedelta(days=1)
    return (
        window_from.isoformat().replace("+00:00", "Z"),
        report_start.isoformat().replace("+00:00", "Z"),
    )


def _load_json_source(
    *,
    env_var: str,
    path_env_var: str,
    default: Any,
    comma_separated_fallback: bool = False,
) -> Any:
    path_value = os.getenv(path_env_var)
    if path_value:
        return json.loads(Path(path_value).read_text(encoding="utf-8"))

    raw_value = os.getenv(env_var)
    if raw_value:
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            if comma_separated_fallback:
                return [item.strip() for item in raw_value.split(",") if item.strip()]
            raise

    return default


def build_job_outputs(
    *,
    report_date: str,
    resolved_version: str | None,
    installed_version: str | None,
    should_act: bool,
    act_reason: str,
    issues_enabled: bool,
    observed_findings_present: bool,
    analyze_day: str | None = None,
    report_tz: str | None = None,
) -> dict[str, str]:
    outputs = {
        "should_act": _stringify_bool(should_act),
        "resolved_version": resolved_version or "",
        "installed_version": installed_version or "",
        "act_reason": act_reason,
        "issues_enabled": _stringify_bool(issues_enabled),
        "observed_findings_present": _stringify_bool(observed_findings_present),
        "stats_artifact_name": f"doctor-stats-{report_date}",
        "findings_artifact_name": f"doctor-findings-{report_date}",
    }

    if analyze_day is not None:
        outputs["analyze_day"] = analyze_day
    if report_tz is not None:
        outputs["report_tz"] = report_tz

    return outputs


def assemble_collect_result(
    *,
    repo_root: Path,
    expected_manifest: dict[str, Any],
    source_tags: list[str],
    target_version: str | None,
    allow_breaking_update: bool,
    issues_enabled: bool,
    repo_full_name: str,
    repo_default_branch: str,
    workflow_name: str,
    workflow_run_id: int,
    workflow_run_attempt: int,
    workflow_event_name: str,
    workflow_actor: str,
    workflow_mode: str,
    source_repo_full_name: str,
    analyze_day: str | None,
    report_tz: str | None,
    collected_at: str,
    report_date: str,
    window_from: str,
    window_to: str,
    daily_commits: list[dict[str, Any]] | None = None,
    daily_prs: list[dict[str, Any]] | None = None,
    daily_issues: list[dict[str, Any]] | None = None,
    snapshot_prs: list[dict[str, Any]] | None = None,
    snapshot_issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    repo_root = Path(repo_root)
    version_state = resolve_version_state(
        repo_root=repo_root,
        target_version=target_version,
        source_tags=source_tags,
        allow_breaking_update=allow_breaking_update,
    )
    scan_result = scan_repository_files(repo_root=repo_root, expected_manifest=expected_manifest)
    environment_findings = _build_environment_findings(issues_enabled=issues_enabled)

    flags = {
        "toolkit_missing": not (repo_root / ".toolkit").exists(),
        "version_missing": not (repo_root / ".toolkit" / "VERSION").exists(),
        "version_outdated": version_state["act_reason"] == "version_outdated",
        "managed_drift": scan_result["managed_drift_present"],
        "reference_bundle_drift": scan_result["reference_bundle_drift_present"],
        "bootstrap_missing": scan_result["bootstrap_missing_present"],
        "breaking_update_blocked": version_state["act_reason"] == "breaking_update_blocked",
        "operational_error": version_state["act_reason"] == "operational_error",
    }

    should_act = any(
        flags[name]
        for name in (
            "toolkit_missing",
            "version_missing",
            "version_outdated",
            "managed_drift",
            "reference_bundle_drift",
            "bootstrap_missing",
        )
    )
    if flags["breaking_update_blocked"] or flags["operational_error"]:
        should_act = False

    if should_act:
        act_reason = select_act_reason(flags)
    elif flags["operational_error"]:
        act_reason = "operational_error"
    elif flags["breaking_update_blocked"]:
        act_reason = "breaking_update_blocked"
    else:
        act_reason = "healthy"

    findings = [
        *version_state["findings"],
        *scan_result["findings"],
        *environment_findings,
    ]

    normalized_commits = [
        enrich_commit_record_with_trailers(commit)
        if any(field not in commit for field in ("method", "agent", "co_authored_by", "refs", "closes"))
        else dict(commit)
        for commit in (daily_commits or [])
    ]
    activity_sections = build_activity_sections(
        daily_commits=normalized_commits,
        daily_prs=list(daily_prs or []),
        daily_issues=list(daily_issues or []),
        snapshot_prs=list(snapshot_prs or []),
        snapshot_issues=list(snapshot_issues or []),
    )

    job_outputs = build_job_outputs(
        report_date=report_date,
        resolved_version=version_state["resolved_version"],
        installed_version=version_state["installed_version"],
        should_act=should_act,
        act_reason=act_reason,
        issues_enabled=issues_enabled,
        observed_findings_present=scan_result["observed_findings_present"],
        analyze_day=analyze_day,
        report_tz=report_tz,
    )

    stats_payload: dict[str, Any] | None = None
    if not version_state["fatal_error"]:
        stats_payload = {
            "schema_version": "doctor-stats/v1",
            "collected_at": collected_at,
            "report_date": report_date,
            "window": {
                "from": window_from,
                "to": window_to,
            },
            "repo": {
                "full_name": repo_full_name,
                "default_branch": repo_default_branch,
            },
            "workflow": {
                "name": workflow_name,
                "run_id": workflow_run_id,
                "run_attempt": workflow_run_attempt,
                "event_name": workflow_event_name,
                "actor": workflow_actor,
                "inputs": {
                    "mode": workflow_mode,
                    "target_version": target_version,
                    "allow_breaking_update": allow_breaking_update,
                },
            },
            "source_repo": {
                "full_name": source_repo_full_name,
                "resolved_version": version_state["resolved_version"],
                "resolved_from": version_state["resolved_from"],
                "compatibility_blocked": version_state["compatibility_blocked"],
                "latest_tag": version_state["latest_tag"],
            },
            "toolkit": {
                "installed_version": version_state["installed_version"],
            },
            **activity_sections,
        }

    findings_payload = {
        "schema_version": "doctor-findings/v1",
        "collected_at": collected_at,
        "report_date": report_date,
        "repo": {
            "full_name": repo_full_name,
            "default_branch": repo_default_branch,
        },
        "source_repo": {
            "resolved_version": version_state["resolved_version"] or "",
        },
        "decision": {
            "should_act": should_act,
            "act_reason": act_reason,
            "managed_drift_present": scan_result["managed_drift_present"],
            "reference_bundle_drift_present": scan_result["reference_bundle_drift_present"],
            "bootstrap_missing_present": scan_result["bootstrap_missing_present"],
            "observed_findings_present": scan_result["observed_findings_present"],
        },
        "checks": scan_result["checks"],
        "findings": findings,
    }

    return {
        "fatal_error": version_state["fatal_error"],
        "job_outputs": job_outputs,
        "stats_payload": stats_payload,
        "findings_payload": findings_payload,
    }


def _write_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def _write_github_output(outputs: dict[str, str]) -> None:
    github_output = os.getenv("GITHUB_OUTPUT")
    if not github_output:
        return

    with Path(github_output).open("a", encoding="utf-8") as handle:
        for key, value in outputs.items():
            handle.write(f"{key}={value}\n")


def main() -> int:
    repo_root = Path(os.getenv("DOCTOR_REPO_ROOT", ".")).resolve()
    output_dir = Path(os.getenv("DOCTOR_OUTPUT_DIR", ".")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    collected_at = os.getenv("DOCTOR_COLLECTED_AT", _rfc3339_now())
    report_date = os.getenv("DOCTOR_REPORT_DATE", collected_at[:10])
    default_window_from, default_window_to = _default_window(report_date)

    expected_manifest = _load_json_source(
        env_var="DOCTOR_EXPECTED_MANIFEST",
        path_env_var="DOCTOR_EXPECTED_MANIFEST_PATH",
        default={},
    )
    source_tags = _load_json_source(
        env_var="DOCTOR_SOURCE_TAGS",
        path_env_var="DOCTOR_SOURCE_TAGS_PATH",
        default=[],
        comma_separated_fallback=True,
    )
    activity_payload = _load_json_source(
        env_var="DOCTOR_ACTIVITY",
        path_env_var="DOCTOR_ACTIVITY_PATH",
        default={},
    )

    result = assemble_collect_result(
        repo_root=repo_root,
        expected_manifest=expected_manifest,
        source_tags=list(source_tags),
        target_version=os.getenv("DOCTOR_TARGET_VERSION") or None,
        allow_breaking_update=_parse_bool(os.getenv("DOCTOR_ALLOW_BREAKING_UPDATE")),
        issues_enabled=_parse_bool(os.getenv("DOCTOR_ISSUES_ENABLED"), default=True),
        repo_full_name=os.getenv("DOCTOR_REPO_FULL_NAME", os.getenv("GITHUB_REPOSITORY", "")),
        repo_default_branch=os.getenv("DOCTOR_REPO_DEFAULT_BRANCH", "main"),
        workflow_name=os.getenv("GITHUB_WORKFLOW", "doctor"),
        workflow_run_id=int(os.getenv("GITHUB_RUN_ID", "0")),
        workflow_run_attempt=int(os.getenv("GITHUB_RUN_ATTEMPT", "0")),
        workflow_event_name=os.getenv("GITHUB_EVENT_NAME", "workflow_dispatch"),
        workflow_actor=os.getenv("GITHUB_ACTOR", ""),
        workflow_mode=os.getenv("DOCTOR_MODE", "auto"),
        source_repo_full_name=os.getenv("DOCTOR_SOURCE_REPO", "G-Core/agent-toolkit"),
        analyze_day=os.getenv("DOCTOR_ANALYZE_DAY"),
        report_tz=os.getenv("DOCTOR_REPORT_TZ"),
        collected_at=collected_at,
        report_date=report_date,
        window_from=os.getenv("DOCTOR_WINDOW_FROM", default_window_from),
        window_to=os.getenv("DOCTOR_WINDOW_TO", default_window_to),
        daily_commits=activity_payload.get("commits", []),
        daily_prs=activity_payload.get("prs", []),
        daily_issues=activity_payload.get("issues", []),
        snapshot_prs=activity_payload.get("snapshot_prs", []),
        snapshot_issues=activity_payload.get("snapshot_issues", []),
    )

    findings_path = output_dir / "doctor-findings.json"
    _write_json_file(findings_path, result["findings_payload"])

    if result["stats_payload"] is not None:
        _write_json_file(output_dir / "doctor-stats.json", result["stats_payload"])

    _write_github_output(result["job_outputs"])
    return 1 if result["fatal_error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
