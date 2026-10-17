# Vromon backend image. Build from the repository root (the app reads ../data/seed):
#   docker build -f backend/Dockerfile -t vromon-backend .
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/backend

# Exact tested dependency versions first (better layer caching)
COPY backend/requirements.lock ./requirements.lock
RUN pip install -r requirements.lock

COPY backend/pyproject.toml backend/README.md ./
COPY backend/app ./app
COPY backend/alembic.ini ./alembic.ini
COPY backend/alembic ./alembic
COPY data/seed /srv/data/seed
COPY data/geo/countries.json data/geo/regions.json data/geo/cities.json /srv/data/geo/
RUN pip install --no-deps -e . \
    && useradd --create-home --uid 10001 vromon
USER vromon

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status == 200 else 1)"

# Behind the host's HTTPS proxy: take the client IP from X-Forwarded-For (rate limits are per IP).
# FORWARDED_ALLOW_IPS narrows which proxies are trusted; '*' suits Render-style single-proxy hosting.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-*}"]
