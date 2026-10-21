FROM node:24-alpine
WORKDIR /app
# Dependencies first so they cache: root package + the web workspace's manifest.
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
COPY web ./web
CMD ["npx", "tsx", "src/main.ts"]
