FROM node:22-slim

# ── System deps ──────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-noto-color-emoji \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        xdg-utils \
        procps \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ── App layout ───────────────────────────────────────────────────────────────
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY scripts/ ./scripts/
RUN chmod +x scripts/*.js

# ── Defaults ─────────────────────────────────────────────────────────────────
ENV CHROME_BIN=/usr/bin/chromium
ENV CDP_PORT=9222
ENV LOG_DIR=/tmp/browser-logs

EXPOSE 9222

# Start with a shell so the user can issue commands interactively
CMD ["bash"]
