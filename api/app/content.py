from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re

from .config import settings


@dataclass
class MarkdownPost:
    slug: str
    title: str
    date: str
    excerpt: str
    body: str
    source: str = "markdown"


def _strip_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    raw = text[3:end].strip()
    body = text[end + 4 :].strip()
    meta: dict[str, str | list[str]] = {}
    current_key: str | None = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        if line.startswith("  - ") and current_key:
            meta.setdefault(current_key, [])
            value = line[4:].strip()
            if isinstance(meta[current_key], list):
                meta[current_key].append(value)
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            current_key = key.strip()
            meta[current_key] = value.strip()
    return meta, body


def _plain_excerpt(markdown: str, limit: int = 180) -> str:
    text = re.sub(r"\[[^\]]+\]\([^)]+\)", "", markdown)
    text = re.sub(r"[#>*_`~-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def load_markdown_posts() -> list[MarkdownPost]:
    posts_dir = settings.posts_dir
    if not posts_dir.exists():
        return []
    posts: list[MarkdownPost] = []
    for path in sorted(posts_dir.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        meta, body = _strip_front_matter(raw)
        title = str(meta.get("title") or path.stem)
        date = str(meta.get("date") or "")
        posts.append(
            MarkdownPost(
                slug=path.stem,
                title=title,
                date=date,
                excerpt=_plain_excerpt(body),
                body=body,
            )
        )
    posts.sort(key=lambda item: item.date or datetime.min.isoformat(), reverse=True)
    return posts


def get_markdown_post(slug: str) -> MarkdownPost | None:
    for post in load_markdown_posts():
        if post.slug == slug:
            return post
    return None


def search_markdown_posts(query: str) -> list[MarkdownPost]:
    needle = query.casefold()
    return [
        post
        for post in load_markdown_posts()
        if needle in post.title.casefold() or needle in post.body.casefold()
    ]
