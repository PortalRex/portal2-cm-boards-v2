# syntax=docker/dockerfile:1
# Builds the web server, then runs it on a Node image: run submissions use the demo parser (node).
FROM rust:1-bookworm AS build
WORKDIR /src
# Cargo.lock is committed and --locked keeps the build to it: every deploy gets the same dependencies.
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked && cp target/release/server /usr/local/bin/server

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY demo-parser/package.json demo-parser/package-lock.json demo-parser/
RUN cd demo-parser && npm ci --omit=dev --no-audit --no-fund
COPY demo-parser demo-parser
COPY --from=build /usr/local/bin/server /usr/local/bin/server
# points/ and cache/ (relative to /app) hold the server's caches; /data is the uploads volume.
RUN mkdir -p points cache /data/demos /data/map-images && chown -R node:node /app /data
USER node
EXPOSE 8080
# Run directly, not through node's docker-entrypoint.sh: sh drops the dotted variables (SERVER.HOST, ...).
ENTRYPOINT ["server"]
