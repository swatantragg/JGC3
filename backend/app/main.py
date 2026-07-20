"""FastAPI application entrypoint for the Jaikvin Global Export System."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from . import models  # noqa: F401  (ensure models are registered before create_all)
from .routers import (
    suppliers, buyers, items, transports, purchase_orders, invoices, dashboard, reports,
)

# Create tables on startup. Swap for Alembic migrations in a larger deployment.
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (suppliers, buyers, items, transports, purchase_orders, invoices, dashboard, reports):
    app.include_router(r.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/", tags=["health"])
def root():
    return {"service": settings.app_name, "docs": "/docs", "health": "/health"}
