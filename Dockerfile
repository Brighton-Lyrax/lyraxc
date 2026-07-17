# Playwright base image ships with browsers and OS dependencies preinstalled.
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
# Browsers already exist in the base image; skip the postinstall download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# Copy source and build.
COPY . .
RUN npm run build

# Production defaults.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    BROWSER_HEADLESS=true \
    LOG_PRETTY=false

EXPOSE 3000
CMD ["npm", "start"]
