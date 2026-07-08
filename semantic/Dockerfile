FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Build the demo dataset at image-build time. Replace with real per-client
# extracts (mount a volume or fetch on start) in production.
RUN python seed.py

EXPOSE 8000
# SEMANTIC_API_TOKEN is provided at runtime.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
