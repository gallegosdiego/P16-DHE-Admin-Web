#!/usr/bin/env bash

set -Eeuo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_ROOT="$(cd "${SOURCE_ROOT}/.." && pwd)"
APP_ROOT="${1:-${DANHEI_APP_ROOT:-/home/danheiex/api.danheiexpress.com}}"
PHP_BIN="${DANHEI_PHP_BIN:-/usr/local/bin/php}"
TASK_TIMEOUT_SECONDS="${DEPLOY_TASK_TIMEOUT_SECONDS:-90}"
MIGRATION_TIMEOUT_SECONDS="${DEPLOY_MIGRATION_TIMEOUT_SECONDS:-240}"
TOTAL_TIMEOUT_SECONDS="${DEPLOY_TOTAL_TIMEOUT_SECONDS:-900}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/home/danheiex/.danhei-api-deploy.lock}"
LOG_FILE="${APP_ROOT}/storage/logs/deploy-cpanel.log"
ATTEMPT_MARKER="${APP_ROOT}/storage/logs/deploy-cpanel.last-attempt"
FAILURE_MARKER="${APP_ROOT}/storage/logs/deploy-cpanel.last-failure"
SUCCESS_MARKER="${APP_ROOT}/storage/logs/deploy-cpanel.last-success"
CURRENT_PHASE="initialization"

SOURCE_COMMIT="$(
    git -C "${REPOSITORY_ROOT}" rev-parse HEAD 2>/dev/null \
        || printf 'unknown'
)"

if [[ ! -d "${SOURCE_ROOT}" ]]; then
    echo "ERROR: deployment source does not exist: ${SOURCE_ROOT}" >&2
    exit 1
fi

if [[ ! -d "${APP_ROOT}" ]]; then
    echo "ERROR: application directory does not exist: ${APP_ROOT}" >&2
    exit 1
fi

/bin/mkdir -p \
    "${APP_ROOT}/database/migrations" \
    "${APP_ROOT}/scripts" \
    "${APP_ROOT}/storage/logs"

exec > >(/usr/bin/tee -a "${LOG_FILE}") 2>&1

DEPLOY_STARTED_AT="$(date +%s)"
DEPLOY_STARTED_AT_TEXT="$(date '+%Y-%m-%d %H:%M:%S %z')"
/usr/bin/printf \
    'commit=%s\nstarted_at=%s\nstatus=running\nphase=%s\n' \
    "${SOURCE_COMMIT}" \
    "${DEPLOY_STARTED_AT_TEXT}" \
    "${CURRENT_PHASE}" \
    > "${ATTEMPT_MARKER}"

on_exit() {
    local exit_code=$?

    if [[ "${exit_code}" -ne 0 ]]; then
        /usr/bin/printf \
            'commit=%s\nfailed_at=%s\nstatus=failed\nphase=%s\nexit_code=%s\n' \
            "${SOURCE_COMMIT}" \
            "$(date '+%Y-%m-%d %H:%M:%S %z')" \
            "${CURRENT_PHASE}" \
            "${exit_code}" \
            > "${FAILURE_MARKER}"

        /usr/bin/printf \
            'commit=%s\nstarted_at=%s\nfailed_at=%s\nstatus=failed\nphase=%s\nexit_code=%s\n' \
            "${SOURCE_COMMIT}" \
            "${DEPLOY_STARTED_AT_TEXT}" \
            "$(date '+%Y-%m-%d %H:%M:%S %z')" \
            "${CURRENT_PHASE}" \
            "${exit_code}" \
            > "${ATTEMPT_MARKER}"

        echo "============================================================"
        echo "Danhei API cPanel deploy FAILED"
        echo "Commit: ${SOURCE_COMMIT}"
        echo "Phase: ${CURRENT_PHASE}"
        echo "Exit code: ${exit_code}"
        echo "Log: ${LOG_FILE}"
        echo "============================================================"
    fi
}

trap on_exit EXIT

CURRENT_PHASE="validate PHP runtime"
if [[ ! -x "${PHP_BIN}" ]]; then
    echo "ERROR: PHP executable is unavailable: ${PHP_BIN}" >&2
    exit 1
fi

CURRENT_PHASE="validate timeout guard"
TIMEOUT_BIN="$(command -v timeout || true)"

if [[ -z "${TIMEOUT_BIN}" ]]; then
    echo "ERROR: the timeout command is required to prevent stuck deployments." >&2
    exit 1
fi

CURRENT_PHASE="acquire deployment lock"
if command -v flock >/dev/null 2>&1; then
    exec 9>"${LOCK_FILE}"

    if ! flock -n 9; then
        echo "ERROR: another Danhei API deployment is already running."
        exit 75
    fi
else
    echo "WARN: flock is unavailable; continuing without the overlap guard."
fi

CURRENT_PHASE="validate existing API runtime"
for required_path in \
    "${APP_ROOT}/artisan" \
    "${APP_ROOT}/bootstrap/app.php" \
    "${APP_ROOT}/vendor/autoload.php" \
    "${APP_ROOT}/.env"; do
    if [[ ! -f "${required_path}" ]]; then
        echo "ERROR: existing API runtime is incomplete; missing ${required_path}" >&2
        exit 1
    fi
done

run_step() {
    local label="$1"
    local requested_timeout="$2"
    shift 2

    local now elapsed remaining timeout_for_step step_started exit_code duration
    CURRENT_PHASE="${label}"
    /usr/bin/printf \
        'commit=%s\nstarted_at=%s\nstatus=running\nphase=%s\n' \
        "${SOURCE_COMMIT}" \
        "${DEPLOY_STARTED_AT_TEXT}" \
        "${CURRENT_PHASE}" \
        > "${ATTEMPT_MARKER}"
    now="$(date +%s)"
    elapsed=$((now - DEPLOY_STARTED_AT))
    remaining=$((TOTAL_TIMEOUT_SECONDS - elapsed))

    if (( remaining <= 0 )); then
        echo "ERROR: total deployment limit of ${TOTAL_TIMEOUT_SECONDS}s was reached before: ${label}"
        return 124
    fi

    timeout_for_step="${requested_timeout}"
    if (( remaining < timeout_for_step )); then
        timeout_for_step="${remaining}"
    fi

    step_started="$(date +%s)"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] START ${label} (limit ${timeout_for_step}s)"

    set +e
    "${TIMEOUT_BIN}" \
        --foreground \
        --signal=TERM \
        --kill-after=10s \
        "${timeout_for_step}s" \
        "$@"
    exit_code=$?
    set -e

    duration=$(($(date +%s) - step_started))

    if [[ "${exit_code}" -eq 124 || "${exit_code}" -eq 137 || "${exit_code}" -eq 143 ]]; then
        echo "ERROR: ${label} exceeded its time limit after ${duration}s."
        return "${exit_code}"
    fi

    if [[ "${exit_code}" -ne 0 ]]; then
        echo "ERROR: ${label} failed with exit code ${exit_code} after ${duration}s."
        return "${exit_code}"
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK ${label} (${duration}s)"
}

echo "============================================================"
echo "Danhei API cPanel release started at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Source: ${SOURCE_ROOT}"
echo "Application: ${APP_ROOT}"
echo "Commit: ${SOURCE_COMMIT}"
echo "Strategy: schema first, application code second"
echo "============================================================"

INTAKE_MIGRATIONS=(
    "2026_07_16_140000_create_core_pickup_foundation.php"
    "2026_07_11_180000_create_operational_foundation_tables.php"
    "2026_07_11_181000_create_idempotency_records_table.php"
    "2026_07_15_100000_add_assigned_user_to_operational_tasks.php"
    "2026_07_15_101000_register_intake_permissions.php"
)

for migration in "${INTAKE_MIGRATIONS[@]}"; do
    run_step \
        "stage critical migration ${migration}" \
        "${TASK_TIMEOUT_SECONDS}" \
        /bin/cp \
        "${SOURCE_ROOT}/database/migrations/${migration}" \
        "${APP_ROOT}/database/migrations/${migration}"
done

run_step \
    "stage operational intake schema verifier" \
    "${TASK_TIMEOUT_SECONDS}" \
    /bin/cp \
    "${SOURCE_ROOT}/scripts/ensure-operational-intake-schema.php" \
    "${APP_ROOT}/scripts/ensure-operational-intake-schema.php"

cd "${APP_ROOT}"

for migration in "${INTAKE_MIGRATIONS[@]}"; do
    run_step \
        "pre-migrate ${migration}" \
        "${MIGRATION_TIMEOUT_SECONDS}" \
        "${PHP_BIN}" artisan migrate \
        --force \
        --no-interaction \
        "--path=database/migrations/${migration}"
done

run_step \
    "guarantee operational intake schema before code copy" \
    "${MIGRATION_TIMEOUT_SECONDS}" \
    "${PHP_BIN}" scripts/ensure-operational-intake-schema.php

run_step \
    "copy application files for commit ${SOURCE_COMMIT}" \
    "${TASK_TIMEOUT_SECONDS}" \
    /bin/cp -R "${SOURCE_ROOT}/." "${APP_ROOT}/"

run_step \
    "execute post-copy runtime deployment" \
    "${TOTAL_TIMEOUT_SECONDS}" \
    /usr/bin/env \
    "DANHEI_APP_ROOT=${APP_ROOT}" \
    "DANHEI_DEPLOY_LOCK_HELD=1" \
    "DANHEI_DEPLOY_LOG_INHERITED=1" \
    "DANHEI_DEPLOY_COMMIT=${SOURCE_COMMIT}" \
    "DEPLOY_TOTAL_TIMEOUT_SECONDS=${TOTAL_TIMEOUT_SECONDS}" \
    /bin/bash "${APP_ROOT}/scripts/deploy-cpanel.sh"

CURRENT_PHASE="write success marker"
/usr/bin/printf \
    'commit=%s\ncompleted_at=%s\nstatus=success\n' \
    "${SOURCE_COMMIT}" \
    "$(date '+%Y-%m-%d %H:%M:%S %z')" \
    > "${SUCCESS_MARKER}"

/usr/bin/printf \
    'commit=%s\nstarted_at=%s\ncompleted_at=%s\nstatus=success\nphase=complete\n' \
    "${SOURCE_COMMIT}" \
    "${DEPLOY_STARTED_AT_TEXT}" \
    "$(date '+%Y-%m-%d %H:%M:%S %z')" \
    > "${ATTEMPT_MARKER}"

/bin/rm -f "${FAILURE_MARKER}"

elapsed=$(($(date +%s) - DEPLOY_STARTED_AT))

echo "============================================================"
echo "Danhei API cPanel release completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Commit: ${SOURCE_COMMIT}"
echo "Total duration: ${elapsed}s"
echo "Success marker: ${SUCCESS_MARKER}"
echo "Log: ${LOG_FILE}"
echo "============================================================"
