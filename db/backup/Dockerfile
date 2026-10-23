# Daily database dumps (see backup.sh): the same Postgres image as the database, for a matching pg_dump.
FROM postgres:16-bookworm
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh && mkdir -p /backups
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
