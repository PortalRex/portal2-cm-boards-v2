# Postgres with the board's schema, created when the data volume is empty (first start only). Built rather than
# bind-mounting schema.sql: Coolify runs the compose file away from the repository's files, so a mounted file
# would be missing there (Docker then mounts an empty directory and Postgres fails to start).
FROM postgres:16-bookworm
COPY dbscript/schema.sql /docker-entrypoint-initdb.d/schema.sql
