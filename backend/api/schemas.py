from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TradeNotePayload(BaseModel):
    ticket: int
    account_id: int
    note: str = ""
    setup_tag: str = ""
    mistake_tag: str = ""
    exit_tag: str = ""
    entry_grade: str = ""
    execution_grade: str = ""
    management_grade: str = ""
    initial_sl: float | None = Field(default=None, ge=0.0)


class CreateTagPayload(BaseModel):
    kind: str
    name: str
    category: str = ""


class UpdateTagPayload(BaseModel):
    name: str | None = None
    category: str | None = None


class SwitchAccountResponse(BaseModel):
    status: str
    active_login: int


class SyncResponse(BaseModel):
    status: str
    synced_login: int | None = None


class AccountsResponse(BaseModel):
    accounts: list[dict[str, Any]]
    active_login: int | None
    mt5_connected: bool


class OpenTradesResponse(BaseModel):
    positions: list[dict[str, Any]]


class StatusResponse(BaseModel):
    status: str


class TagResponse(BaseModel):
    status: str
    tag: dict[str, Any]


class TagsListResponse(BaseModel):
    tags: list[dict[str, Any]]


class TradeCandlesResponse(BaseModel):
    ticket: int
    cached: bool
    h1: list[dict[str, Any]] = Field(default_factory=list)
    m5: list[dict[str, Any]] = Field(default_factory=list)
    m1: list[dict[str, Any]] = Field(default_factory=list)
