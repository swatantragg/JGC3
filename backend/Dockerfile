FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as a nobody rather than as root. If anything in this process is ever
# talked into executing something, it lands as an account that owns no files,
# cannot write to /app and cannot install anything — which is the difference
# between a bad afternoon and a compromised host.
RUN useradd --system --create-home --uid 10001 jaikvin \
    && chown -R jaikvin:jaikvin /app
USER jaikvin

EXPOSE 8000

# One worker on purpose. The rate limits and lockout counters live in the
# database, so more workers would be correct — but a single worker keeps the
# free-tier memory footprint down, and this is a twenty-person office.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
