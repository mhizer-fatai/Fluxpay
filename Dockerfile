# FluxPay backend — Express API + WebSocket gateway (npm workspaces monorepo).
# Used by Render (Docker runtime) or any container host. Listens on $PORT (default 8080).
FROM node:20-slim

WORKDIR /app

# Install the workspace tree from the root lockfile, then compile the backend.
COPY . .
RUN npm ci && npm run build -w backend

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "backend/dist/index.js"]
