"""Score a loan application into a risk band.

`score_application(app)` returns {"score": int, "band": str, "flags": [...]}
computed from the application's income, credit history, employment, and debt.
"""
import os

# Tunable weights (config at the edge).
BASE_SCORE = int(os.environ.get("RISK_BASE_SCORE", "50"))
MIN_INCOME = float(os.environ.get("RISK_MIN_INCOME", "30000"))


def score_application(app: dict) -> dict:
    """Compute a risk score, band, and flags from a loan application dict."""
    score = BASE_SCORE
    flags: list[str] = []

    # Income relative to the requested loan.
    income = float(app.get("annual_income", 0) or 0)
    requested = float(app.get("loan_amount", 0) or 0)
    if income < MIN_INCOME:
        score -= 20
        flags.append("low_income")
    ratio = (requested / income) if income else 999.0
    if ratio > 0.5:
        score -= 15
        flags.append("high_loan_to_income")
    elif ratio < 0.15:
        score += 10

    # Credit history.
    history_years = int(app.get("credit_history_years", 0) or 0)
    score += min(history_years, 10) * 2
    delinquencies = int(app.get("delinquencies_24m", 0) or 0)
    if delinquencies:
        score -= delinquencies * 12
        flags.append("recent_delinquency")
        if delinquencies >= 3 and "low_income" in flags:
            # Compounding risk: thin income AND repeated misses.
            score -= 10
            flags.append("compounding_risk")

    # Employment stability.
    if app.get("employment_status") == "full_time":
        score += 8
    elif app.get("employment_status") in ("unemployed", "gig"):
        score -= 10
        flags.append("unstable_employment")

    # Existing debt load tips a borderline score over the edge.
    open_lines = int(app.get("open_credit_lines", 0) or 0)
    if open_lines > 6 and score < 55:
        score -= 8
        flags.append("overextended")

    score = max(0, min(100, score))
    if score >= 70:
        band = "low"
    elif score >= 45:
        band = "medium"
    else:
        band = "high"
    return {"score": score, "band": band, "flags": flags}
