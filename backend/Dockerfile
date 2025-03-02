# ─── Build Stage ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared types
COPY shared ./shared

# Copy backend
COPY backend/package.json ./backend/
COPY backend/tsconfig.json ./backend/
WORKDIR /app/backend
RUN npm install

COPY backend/src ./src
RUN npm run build

# ─── Production Stage ───────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY backend/package.json ./
RUN npm install --production

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/shared ./shared

# Create logs directory
RUN mkdir -p logs

EXPOSE 3000

CMD ["node", "dist/backend/src/server.js"]
