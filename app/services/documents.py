"""Secure document storage helpers (Module 16).

Files are stored under a configurable root using a random server-generated
name. Original filenames are metadata only and are sanitised before storage.
Downloads always resolve through :func:`resolve_document_path`, which guards
against path traversal.
"""

from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import settings

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._ -]+")
_STORED_NAME_RE = re.compile(r"^[a-f0-9]{32}\.[a-z0-9]{1,10}$")

_CANONICAL_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_MAGIC_BYTES = {
    "pdf": (b"%PDF-",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    "docx": (b"PK\x03\x04",),
}


class DocumentValidationError(ValueError):
    """Raised when an upload violates storage/security policy."""


def allowed_extensions() -> set[str]:
    return {
        item.strip().lower().lstrip(".")
        for item in settings.allowed_document_extensions.split(",")
        if item.strip()
    }


def storage_root() -> Path:
    root = Path(settings.document_storage_path).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def sanitize_filename(filename: str | None) -> str:
    """Return a display-safe basename (never a path)."""
    candidate = (filename or "document").replace("\\", "/").split("/")[-1]
    candidate = _SAFE_NAME_RE.sub("_", candidate).strip(" .")
    return (candidate or "document")[:255]


def _extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower().lstrip(".")
    if suffix not in allowed_extensions():
        allowed = ", ".join(sorted(allowed_extensions()))
        raise DocumentValidationError(
            f"Unsupported file type. Allowed extensions: {allowed}."
        )
    return suffix


def _validate_magic(extension: str, content: bytes) -> None:
    signatures = _MAGIC_BYTES.get(extension)
    if signatures and not any(content.startswith(signature) for signature in signatures):
        raise DocumentValidationError(
            "The file contents do not match the declared file type."
        )


async def save_document(upload: UploadFile) -> dict[str, object]:
    """Validate and persist an upload; returns metadata for the DB row."""
    safe_name = sanitize_filename(upload.filename)
    extension = _extension(safe_name)
    max_bytes = settings.max_document_size_mb * 1024 * 1024

    content = await upload.read(max_bytes + 1)
    if not content:
        raise DocumentValidationError("The uploaded file is empty.")
    if len(content) > max_bytes:
        raise DocumentValidationError(
            f"File is too large. Maximum size is {settings.max_document_size_mb} MB."
        )
    _validate_magic(extension, content)

    stored_name = f"{uuid4().hex}.{extension}"
    path = storage_root() / stored_name
    await run_in_threadpool(path.write_bytes, content)

    return {
        "file_name": safe_name,
        "stored_name": stored_name,
        "file_size": len(content),
        "content_type": _CANONICAL_CONTENT_TYPES.get(
            extension, "application/octet-stream"
        ),
    }


def resolve_document_path(stored_name: str) -> Path:
    """Resolve a stored filename inside the configured root, safely."""
    if not _STORED_NAME_RE.fullmatch(stored_name):
        raise DocumentValidationError("Invalid stored document reference.")
    root = storage_root()
    path = (root / stored_name).resolve()
    if not path.is_relative_to(root):
        raise DocumentValidationError("Invalid document path.")
    return path


async def delete_document_file(stored_name: str) -> None:
    """Best-effort removal of a stored file."""
    try:
        path = resolve_document_path(stored_name)
    except DocumentValidationError:
        return
    if path.exists():
        await run_in_threadpool(path.unlink)
