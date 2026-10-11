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
COPY data/seed /srv/data/seed
RUN pip install --no-deps -e . \
    && useradd --create-home --uid 10001 vromon
USER vromon

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status == 200 else 1)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
