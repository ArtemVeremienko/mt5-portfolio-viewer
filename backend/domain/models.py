from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum, StrEnum
from typing import TypedDict


class DealType(IntEnum):
    BUY = 0
    SELL = 1
    BALANCE = 2


class DealEntry(IntEnum):
    IN = 0
    OUT = 1
    IN_OUT = 2


class TagKind(StrEnum):
    SETUP = "setup"
    EXIT = "exit"
    MISTAKE = "mistake"


class MistakeCategory(StrEnum):
    ENTRY = "entry"
    EXIT_MGMT = "exit_mgmt"


class AccountDict(TypedDict, total=False):
    login: int
    broker: str
    name: str
    server: str
    currency: str
    leverage: int
    balance: float
    equity: float
    margin: float
    free_margin: float
    margin_level: float
    is_demo: int
    last_synced_at: int


class DealDict(TypedDict, total=False):
    ticket: int
    order_id: int
    account_id: int
    time: int
    time_msc: int
    type: int
    entry: int
    symbol: str
    volume: float
    price: float
    profit: float
    swap: float
    commission: float
    sl: float
    tp: float
    open_time: int
    open_price: float
    comment: str
    magic: int
    risk_r: float
    r_multiple: float
    mae_price: float
    mfe_price: float
    mae_pips: float
    mfe_pips: float
    mae_amount: float
    mfe_amount: float
    mae_r: float
    mfe_r: float


class OpenPositionDict(TypedDict):
    ticket: int
    symbol: str
    type: int
    volume: float
    price_open: float
    price_current: float
    sl: float
    tp: float
    profit: float
    swap: float
    time: int
    magic: int
    comment: str


class CandleBarDict(TypedDict):
    time: int
    open: float
    high: float
    low: float
    close: float


@dataclass(frozen=True, slots=True)
class ExcursionResult:
    mae_price: float = 0.0
    mfe_price: float = 0.0
    mae_pips: float = 0.0
    mfe_pips: float = 0.0
    mae_amount: float = 0.0
    mfe_amount: float = 0.0
    mae_r: float = 0.0
    mfe_r: float = 0.0
