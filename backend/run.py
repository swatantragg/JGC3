"""Dev entrypoint — runs the API on the host/port from .env (API_HOST/API_PORT).

    python run.py

Change API_PORT in backend/.env to switch ports without touching any command.
For Docker/production the container runs uvicorn directly (see Dockerfile).
"""
import uvicorn

from app.config import settings

if __name__ == "__main__":
    print(f"→ Jaikvin backend on http://{settings.api_host}:{settings.api_port}  (docs: /docs)")
    uvicorn.run("app.main:app", host=settings.api_host, port=settings.api_port, reload=settings.reload)
