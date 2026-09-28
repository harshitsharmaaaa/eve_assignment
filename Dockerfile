FROM oven/bun:1.3.9
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/db/package.json packages/db/package.json
RUN bun install
COPY . .
EXPOSE 3000
CMD ["bun", "src/index.ts"]
