from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from backend.api.deps import get_db_path
from backend.api.schemas import (
    CreateTagPayload,
    TagResponse,
    TagsListResponse,
    UpdateTagPayload,
)
from backend.infrastructure.db.uow import SqliteUnitOfWork

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=TagsListResponse)
def list_tags(
    db_path: Annotated[Path, Depends(get_db_path)],
    kind: str | None = None,
) -> TagsListResponse:
    with SqliteUnitOfWork(db_path) as uow:
        return TagsListResponse(tags=uow.journal.get_review_tags(kind=kind))


@router.post("", response_model=TagResponse)
def create_tag(
    payload: CreateTagPayload,
    db_path: Annotated[Path, Depends(get_db_path)],
) -> TagResponse:
    try:
        with SqliteUnitOfWork(db_path) as uow:
            tag = uow.journal.create_review_tag(
                kind=payload.kind, name=payload.name, category=payload.category
            )
        return TagResponse(status="ok", tag=tag)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    payload: UpdateTagPayload,
    db_path: Annotated[Path, Depends(get_db_path)],
) -> TagResponse:
    try:
        with SqliteUnitOfWork(db_path) as uow:
            tag = uow.journal.update_review_tag(
                tag_id=tag_id, name=payload.name, category=payload.category
            )
        return TagResponse(status="ok", tag=tag)
    except ValueError as exc:
        status = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.delete("/{tag_id}")
def delete_tag(
    tag_id: int,
    db_path: Annotated[Path, Depends(get_db_path)],
) -> dict[str, object]:
    try:
        with SqliteUnitOfWork(db_path) as uow:
            result = uow.journal.delete_review_tag(tag_id=tag_id)
        return {"status": "ok", **result}
    except ValueError as exc:
        status = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
