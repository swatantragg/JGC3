"""FastAPI application entrypoint for the Jaikvin Global Export System."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from . import models  # noqa: F401  (ensure models are registered before create_all)
from .migrate import run_migrations
from .routers import (
    auth, users, suppliers, buyers, items, transports, purchase_orders, invoices,
    dashboard, reports, costing, masters,
)

# Create tables on startup, then add any column the models have gained since
# the database was last touched — create_all makes tables, never columns.
Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, users, suppliers, buyers, items, transports, purchase_orders, invoices,
          dashboard, reports, costing, masters):
    app.include_router(r.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/", tags=["health"])
def root():
    return {"service": settings.app_name, "docs": "/docs", "health": "/health"}
