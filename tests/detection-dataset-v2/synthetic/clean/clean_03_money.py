from decimal import Decimal, ROUND_HALF_UP


def to_satang(amount: Decimal) -> int:
    """Convert a THB amount to an integer number of satang."""
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def format_thb(satang: int) -> str:
    return f"{satang / 100:,.2f} THB"
