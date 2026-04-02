# Use Node 20+ for Medusa v2
FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Build the Medusa project
RUN npm run build

# Hugging Face runs as user 1000 (non-root)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# HF requires port 7860
EXPOSE 7860

# Start Medusa on the required port
CMD ["npx", "medusa", "start", "--port", "7860", "--host", "0.0.0.0"]
