#!/bin/sh
set -e

if [ ! -w "${CACHE_DIR:-/cache}" ]; then
  echo "WARNING: Cache directory '${CACHE_DIR:-/cache}' is not writable by app user. Disk caching will be disabled."
fi

exec "$@"
