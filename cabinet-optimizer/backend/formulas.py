"""Cabinet production formulas.

This module is intentionally small and beginner-friendly.
Each function returns the number of workers required and
estimated production days based on the cabinet type.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class CalculationResult:
    """Simple data holder for calculation results."""

    workers: int
    days: int


def _estimate_days(quantity: int, workers: int, productivity_factor: float) -> int:
    """Estimate production days based on capacity.

    Each worker builds 1 cabinet per day, multiplied by a productivity factor.
    """

    daily_capacity = workers * 1.0 * productivity_factor
    return max(1, math.ceil(quantity / daily_capacity))


def calculate_basic(quantity: int) -> CalculationResult:
    """Basic cabinet: 2 workers, factor 1.0."""

    workers = 2
    days = _estimate_days(quantity, workers, productivity_factor=1.0)
    return CalculationResult(workers=workers, days=days)


def calculate_premium(quantity: int) -> CalculationResult:
    """Premium cabinet: 3 workers, factor 0.8."""

    workers = 3
    days = _estimate_days(quantity, workers, productivity_factor=0.8)
    return CalculationResult(workers=workers, days=days)


def calculate_custom(quantity: int) -> CalculationResult:
    """Custom cabinet: 4 workers, factor 0.6."""

    workers = 4
    days = _estimate_days(quantity, workers, productivity_factor=0.6)
    return CalculationResult(workers=workers, days=days)


def calculate(type_name: str, quantity: int) -> CalculationResult:
    """Dispatch calculation based on cabinet type."""

    type_name = type_name.strip().lower()

    if type_name == "basic":
        return calculate_basic(quantity)
    if type_name == "premium":
        return calculate_premium(quantity)
    if type_name == "custom":
        return calculate_custom(quantity)

    raise ValueError("Invalid cabinet type. Use basic, premium, or custom.")
