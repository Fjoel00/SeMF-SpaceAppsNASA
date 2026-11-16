FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/backend

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgeos-dev \
    libproj-dev \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY ml ./ml
COPY data ./data
COPY backend ./backend

# Entrenar/verificar artefactos ML si no existen aún
RUN python ml/training/train_models.py && python ml/evaluation/evaluate_models.py

EXPOSE 8000

CMD ["python", "-m", "backend.app.main"]
