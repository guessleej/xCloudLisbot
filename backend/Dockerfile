FROM python:3.11-slim

WORKDIR /app

# Install native dependencies for Azure Speech SDK
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl-dev libasound2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--timeout", "120"]
