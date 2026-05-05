from __future__ import annotations

import argparse
import json
import re
import statistics
import zipfile
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Iterable


def normalize_text(value: str) -> str:
    value = value.replace("\r\n", "\n")
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def normalize_match_title(value: str) -> str:
    return normalize_text(unescape(value)).replace("“", "\"").replace("”", "\"").replace("‘", "'").replace("’", "'").replace("：", ":")


def strip_tags(html: str) -> str:
    html = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S | re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"</p>", "\n", html, flags=re.I)
    html = re.sub(r"</h\d>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", "", html)
    return normalize_text(unescape(html))


@dataclass
class ApiNote:
    note_id: str
    title: str
    note_type: str
    created_at: str
    updated_at: str
    summary: str
    body: str
    reference: str


@dataclass
class LegacyNote:
    note_id: str
    title: str
    created_at: str
    visible_body: str
    visible_links: list[str]
    has_data_json: bool


def parse_api_note(path: Path) -> ApiNote | None:
    data = json.loads(path.read_text())
    summary = data.get("summary", {})
    detail = data.get("detail") or {}
    title = (detail.get("title") or summary.get("title") or "").strip()
    if not title:
      return None

    summary_text = normalize_text(summary.get("content") or detail.get("content") or "")
    detail_content = normalize_text(detail.get("content") or "")
    transcript = normalize_text(((detail.get("audio") or {}).get("original")) or "")
    body = transcript or (detail_content if not detail_content.startswith("### 📑 智能总结") else "")
    reference = normalize_text(detail.get("ref_content") or "")
    return ApiNote(
        note_id=path.stem,
        title=title,
        note_type=(detail.get("note_type") or summary.get("note_type") or "other").strip(),
        created_at=(detail.get("created_at") or summary.get("created_at") or "").strip(),
        updated_at=(detail.get("updated_at") or summary.get("updated_at") or "").strip(),
        summary=summary_text,
        body=body,
        reference=reference,
    )


def parse_legacy_note(name: str, html_text: str) -> LegacyNote | None:
    title_match = re.search(r"<title>(.*?)</title>", html_text, flags=re.S | re.I)
    title = normalize_match_title(strip_tags(title_match.group(1))) if title_match else ""
    if not title:
        h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", html_text, flags=re.S | re.I)
        title = normalize_match_title(strip_tags(h1_match.group(1))) if h1_match else ""
    if not title:
        return None

    created_match = re.search(r"创建于[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})", html_text)
    created_at = f"{created_match.group(1)} {created_match.group(2)}" if created_match else ""

    note_match = re.search(r'<div[^>]+class="note"[^>]*>(.*?)</div>\s*</body>', html_text, flags=re.S | re.I)
    note_html = note_match.group(1) if note_match else html_text
    note_html = re.sub(r"<h1[^>]*>.*?</h1>", "", note_html, flags=re.S | re.I)
    note_html = re.sub(r"<p[^>]*>[^<]*创建于.*?</p>", "", note_html, flags=re.S | re.I)
    note_html = re.sub(r"<p[^>]*>[^<]*标签：.*?</p>", "", note_html, flags=re.S | re.I)
    note_html = re.sub(r'<div[^>]+class="attachment"[^>]*>.*?</div>', "", note_html, flags=re.S | re.I)
    visible_links = re.findall(r'<a[^>]+href="(https?://[^"]+)"', html_text, flags=re.I)
    visible_body = strip_tags(note_html)
    has_data_json = bool(re.search(r'id="jsonData"[^>]+data-json="', html_text))
    return LegacyNote(
        note_id=Path(name).stem,
        title=title,
        created_at=created_at,
        visible_body=visible_body,
        visible_links=visible_links,
        has_data_json=has_data_json,
    )


def parse_dt(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def match_notes(api_notes: Iterable[ApiNote], legacy_notes: Iterable[LegacyNote]) -> list[tuple[ApiNote, LegacyNote, float]]:
    by_title: dict[str, list[LegacyNote]] = {}
    for note in legacy_notes:
        by_title.setdefault(normalize_match_title(note.title), []).append(note)

    pairs: list[tuple[ApiNote, LegacyNote, float]] = []
    for api_note in api_notes:
        candidates = by_title.get(normalize_match_title(api_note.title), [])
        if not candidates:
            continue
        api_dt = parse_dt(api_note.created_at)
        best: tuple[LegacyNote, float] | None = None
        for legacy_note in candidates:
            legacy_dt = parse_dt(legacy_note.created_at)
            if api_dt and legacy_dt:
                diff = abs((api_dt - legacy_dt).total_seconds())
            else:
                diff = 0.0 if api_note.title == legacy_note.title else 999999.0
            if best is None or diff < best[1]:
                best = (legacy_note, diff)
        if best is not None:
            pairs.append((api_note, best[0], best[1]))
    return pairs


def print_stats(pairs: list[tuple[ApiNote, LegacyNote, float]]) -> None:
    strong = [pair for pair in pairs if pair[2] < 300]
    print(f"total_matches={len(pairs)} strong_matches={len(strong)}")

    by_type: dict[str, list[tuple[ApiNote, LegacyNote, float]]] = {}
    for pair in strong:
        by_type.setdefault(pair[0].note_type, []).append(pair)

    for note_type, items in sorted(by_type.items()):
        api_body_lengths = [len(api.body) for api, _, _ in items]
        legacy_body_lengths = [len(legacy.visible_body) for _, legacy, _ in items]
        body_gain = [a - l for a, l in zip(api_body_lengths, legacy_body_lengths)]
        print(
            f"type={note_type} count={len(items)} "
            f"api_body_med={int(statistics.median(api_body_lengths))} "
            f"legacy_body_med={int(statistics.median(legacy_body_lengths))} "
            f"delta_med={int(statistics.median(body_gain))}"
        )


def print_samples(pairs: list[tuple[ApiNote, LegacyNote, float]], note_type: str, limit: int) -> None:
    filtered = [pair for pair in pairs if pair[2] < 300 and pair[0].note_type == note_type]
    filtered.sort(key=lambda pair: (len(pair[0].body) - len(pair[1].visible_body), len(pair[0].body)), reverse=True)
    for index, (api_note, legacy_note, diff) in enumerate(filtered[:limit], start=1):
        print(
            json.dumps(
                {
                    "sample": index,
                    "type": note_type,
                    "title": api_note.title,
                    "api_id": api_note.note_id,
                    "legacy_id": legacy_note.note_id,
                    "time_diff_sec": diff,
                    "api_summary_len": len(api_note.summary),
                    "api_body_len": len(api_note.body),
                    "legacy_visible_len": len(legacy_note.visible_body),
                    "legacy_links": len(legacy_note.visible_links),
                    "has_data_json": legacy_note.has_data_json,
                },
                ensure_ascii=False,
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-cache", required=True)
    parser.add_argument("--zip", required=True)
    args = parser.parse_args()

    raw_root = Path(args.raw_cache)
    zip_path = Path(args.zip)
    api_notes = [note for note in (parse_api_note(path) for path in raw_root.glob("*.json")) if note]

    legacy_notes: list[LegacyNote] = []
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if not name.startswith("notes/") or not name.endswith(".html") or name == "notes/index.html":
                continue
            note = parse_legacy_note(name, archive.read(name).decode("utf-8", "ignore"))
            if note:
                legacy_notes.append(note)

    pairs = match_notes(api_notes, legacy_notes)
    print_stats(pairs)
    for note_type in ["audio", "meeting", "link", "plain_text"]:
        print(f"== samples:{note_type} ==")
        print_samples(pairs, note_type, 2)


if __name__ == "__main__":
    main()
