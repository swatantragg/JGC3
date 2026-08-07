"""Reading the audit trail. Admin only, and read-only.

There is no endpoint here that writes, edits or deletes a row — that is the
whole value of the table. An admin who misuses their access can see the log
but cannot groom it, so "the record disagrees with the story" stays possible.

Writing happens in app/audit.py, called from the routes that do the things
worth recording.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from .. import models, schemas

router = APIRouter(prefix="/api/audit", tags=["audit"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[schemas.AuditRow])
def list_events(
    db: Session = Depends(get_db),
    action: str | None = Query(None, description="Exact action, or a prefix like \"auth.\""),
    actor: str | None = Query(None, description="Email of the person who acted"),
    outcome: str | None = Query(None, description="ok | denied | error"),
    days: int = Query(30, ge=1, le=365, description="How far back to look"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    q = db.query(models.AuditLog).filter(
        models.AuditLog.at >= datetime.utcnow() - timedelta(days=days)
    )
    if action:
        # A trailing dot reads as "everything in this group" — "auth." gives
        # every sign-in event without listing the eight names it covers.
        q = (q.filter(models.AuditLog.action.startswith(action)) if action.endswith(".")
             else q.filter(models.AuditLog.action == action))
    if actor:
        q = q.filter(models.AuditLog.actor_email == actor.strip().lower())
    if outcome:
        q = q.filter(models.AuditLog.outcome == outcome)
    return q.order_by(models.AuditLog.at.desc()).offset(offset).limit(limit).all()


@router.get("/summary")
def summary(db: Session = Depends(get_db), days: int = Query(7, ge=1, le=90)):
    """Counts per action over the window — what the Setup screen shows at the
    top, so an unusual number of failed sign-ins is visible without reading
    down a list of two thousand rows."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(models.AuditLog.action, models.AuditLog.outcome)
        .filter(models.AuditLog.at >= since)
        .all()
    )
    counts: dict[str, int] = {}
    for action, outcome in rows:
        counts[action] = counts.get(action, 0) + 1
        if outcome != "ok":
            counts[f"{action}:{outcome}"] = counts.get(f"{action}:{outcome}", 0) + 1
    return {"days": days, "total": len(rows), "counts": counts}
