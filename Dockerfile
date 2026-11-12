# QuizArena — multi-stage production build.
# Stage 1 builds the React client; stage 2 runs the Express + Socket.IO
# server, which serves client/dist itself (same-origin) when NODE_ENV=production.

# ---------------------------------------------------------------- client ---
FROM node:20-alpine AS client-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------------------------------------------------------------- server ---
FROM node:20-alpine AS server
ENV NODE_ENV=production
WORKDIR /app

# Server dependencies only (jest/supertest stay out of the image).
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# Server source + the built client bundle (served at ../client/dist by server.js).
COPY server/ ./server/
COPY --from=client-build /build/client/dist ./client/dist

EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:5001/api/health || exit 1

CMD ["node", "server/server.js"]
