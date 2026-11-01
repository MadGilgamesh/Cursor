#!/usr/bin/env bash
# Stawia PostgreSQL, Redis, migracje, API, worker, grę i Kancelarię.
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose up --build "$@"
