FROM python:3.12-slim

WORKDIR /app

# Copy requirements from backend subfolder (build context = repo root)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire repo so "from backend.agent..." imports resolve
COPY . .

EXPOSE 8000

CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
