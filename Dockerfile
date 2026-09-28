FROM oven/bun:1.3.9
WORKDIR /app
COPY . .
RUN bun install
RUN cd packages/db && bun install
EXPOSE 3000
CMD ["bun", "src/index.ts"]
