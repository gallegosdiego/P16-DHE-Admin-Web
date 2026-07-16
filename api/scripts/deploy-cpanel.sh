#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="${DANHEI_APP_ROOT:-/home/danheiex/api.danheiexpress.com}"
PHP_BIN="${DANHEI_PHP_BIN:-/usr/local/bin/php}"
TASK_TIMEOUT_SECONDS="${DEPLOY_TASK_TIMEOUT_SECONDS:-90}"
TOTAL_TIMEOUT_SECONDS="${DEPLOY_TOTAL_TIMEOUT_SECONDS:-600}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/home/danheiex/.danhei-api-deploy.lock}"
LOG_FILE="${APP_ROOT}/storage/logs/deploy-cpanel.log"

if [[ ! -d "${APP_ROOT}" ]]; then
    echo "ERROR: application directory does not exist: ${APP_ROOT}" >&2
    exit 1
fi

if [[ ! -x "${PHP_BIN}" ]]; then
    echo "ERROR: PHP executable is unavailable: ${PHP_BIN}" >&2
    exit 1
fi

TIMEOUT_BIN="$(command -v timeout || true)"

if [[ -z "${TIMEOUT_BIN}" ]]; then
    echo "ERROR: the timeout command is required to prevent stuck deployments." >&2
    exit 1
fi

/bin/mkdir -p "${APP_ROOT}/storage/logs"
exec > >(/usr/bin/tee -a "${LOG_FILE}") 2>&1

if command -v flock >/dev/null 2>&1; then
    exec 9>"${LOCK_FILE}"

    if ! flock -n 9; then
        echo "ERROR: another Danhei API deployment is already running."
        exit 75
    fi
else
    echo "WARN: flock is unavailable; continuing without the overlap guard."
fi

cd "${APP_ROOT}"

DEPLOY_STARTED_AT="$(date +%s)"

run_step() {
    local label="$1"
    shift

    local now elapsed remaining timeout_for_step step_started exit_code duration
    now="$(date +%s)"
    elapsed=$((now - DEPLOY_STARTED_AT))
    remaining=$((TOTAL_TIMEOUT_SECONDS - elapsed))

    if (( remaining <= 0 )); then
        echo "ERROR: total deployment limit of ${TOTAL_TIMEOUT_SECONDS}s was reached before: ${label}"
        return 124
    fi

    timeout_for_step="${TASK_TIMEOUT_SECONDS}"
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
echo "Danhei API cPanel deploy started at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Application: ${APP_ROOT}"
echo "Task timeout: ${TASK_TIMEOUT_SECONDS}s"
echo "Total timeout: ${TOTAL_TIMEOUT_SECONDS}s"
echo "============================================================"

run_step \
    "clear Laravel runtime caches" \
    "${PHP_BIN}" artisan optimize:clear --no-interaction

REPAIR_SCRIPTS=(
    "repair-public-storage-link.php"
    "repair-cod-schema.php"
    "repair-driver-mobile-geo-schema.php"
    "repair-driver-documents-schema.php"
    "repair-route-day-index.php"
)

for script in "${REPAIR_SCRIPTS[@]}"; do
    run_step \
        "run ${script}" \
        "${PHP_BIN}" "scripts/${script}"
done

MIGRATIONS=(
    "2026_07_11_180000_create_operational_foundation_tables.php"
    "2026_07_11_181000_create_idempotency_records_table.php"
    "2026_07_12_150000_create_reconciliation_ledgers.php"
    "2026_07_12_170000_create_route_task_stops_table.php"
    "2026_07_15_100000_add_assigned_user_to_operational_tasks.php"
    "2026_07_15_101000_register_intake_permissions.php"
    "2026_07_16_120000_create_financial_rate_rules.php"
    "2026_07_16_130000_add_financial_receipts_reversals_and_opening.php"
)

for migration in "${MIGRATIONS[@]}"; do
    run_step \
        "migrate ${migration}" \
        "${PHP_BIN}" artisan migrate \
        --force \
        --no-interaction \
        "--path=database/migrations/${migration}"
done

elapsed=$(($(date +%s) - DEPLOY_STARTED_AT))

echo "============================================================"
echo "Danhei API cPanel deploy completed at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Total duration: ${elapsed}s"
echo "Log: ${LOG_FILE}"
echo "============================================================"
