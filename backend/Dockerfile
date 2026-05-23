FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source
COPY . .

# Copy and make startup script executable
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8000

# start.sh launches both FastAPI and Celery worker
CMD ["./start.sh"]
