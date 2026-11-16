from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np


def get_sqn_rating(sqn: float) -> dict[str, str]:
    """Return Van Tharp rating and badge class for a given SQN value."""
    if sqn < 1.6:
        return {"category": "Poor", "badge": "border-red-500/30 text-red-400 bg-red-500/10"}
    if sqn < 2.0:
        return {
            "category": "Average",
            "badge": "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
        }
    if sqn < 2.5:
        return {
            "category": "Good",
            "badge": "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
        }
    if sqn < 3.0:
        return {
            "category": "Very Good",
            "badge": "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
        }
    if sqn < 5.0:
        return {
            "category": "Excellent",
            "badge": "border-blue-500/30 text-blue-400 bg-blue-500/10",
        }
    return {
        "category": "Superb (Holy Grail)",
        "badge": "border-purple-500/30 text-purple-400 bg-purple-500/10",
    }


def compute_sqn(r_multiples: list[float]) -> tuple[float, float, float]:
    """Compute (sqn, avg_r, std_r) using Van Tharp's sqrt(min(100, N)) clamp."""
    total_trades = len(r_multiples)
    if total_trades == 0:
        return 0.0, 0.0, 0.0
    avg_r = float(np.mean(r_multiples))
    std_r = float(np.std(r_multiples, ddof=1)) if total_trades > 1 else 0.0
    if total_trades > 1 and std_r > 0:
        sqn = (avg_r / std_r) * min(10.0, math.sqrt(total_trades))
    else:
        sqn = 0.0
    return sqn, avg_r, std_r


def build_r_distribution(r_multiples: list[float]) -> list[dict[str, Any]]:
    """Bucket R-multiples into Van Tharp distribution bands."""
    bucket_defs: tuple[tuple[str, Callable[[float], bool]], ...] = (
        ("<-2R", lambda r: r < -2.0),
        ("[-2R, -1R]", lambda r: -2.0 <= r < -1.0),
        ("[-1R, 0R]", lambda r: -1.0 <= r < 0.0),
        ("[0R, 1R]", lambda r: 0.0 <= r < 1.0),
        ("[1R, 2R]", lambda r: 1.0 <= r < 2.0),
        ("[2R, 5R]", lambda r: 2.0 <= r < 5.0),
        (">5R", lambda r: r >= 5.0),
    )
    total = len(r_multiples)
    out: list[dict[str, Any]] = []
    for label, fn in bucket_defs:
        matching = [r for r in r_multiples if fn(r)]
        out.append(
            {
                "bucket": label,
                "count": len(matching),
                "pct": round(len(matching) / total * 100.0, 1) if total else 0.0,
            }
        )
    return out
