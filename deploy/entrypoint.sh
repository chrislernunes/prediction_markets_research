#!/bin/bash
# Combined entrypoint: C++ arb bot plus TS redemption service.
#
# Each service is restarted after a crash with exponential backoff, but a service that
# keeps crashing is not restarted forever: more than MAX_RESTARTS exits inside
# RESTART_WINDOW_S seconds stops the container with a non-zero status so the platform's
# restart policy (and your alerting) sees the failure instead of a silent crash loop.
set -uo pipefail

# shellcheck source=/dev/null
. "$(dirname "$0")/load-secrets.sh"

DRY_RUN="${DRY_RUN:-true}"
export DRY_RUN
require_live_confirmation || exit $?
load_private_key_from_secret_manager || exit 1

MAX_RESTARTS="${MAX_RESTARTS:-5}"
RESTART_WINDOW_S="${RESTART_WINDOW_S:-600}"
BACKOFF_START_S="${BACKOFF_START_S:-5}"
BACKOFF_MAX_S="${BACKOFF_MAX_S:-120}"

echo "=== Polymarket Combined Service (DRY_RUN=${DRY_RUN}) ==="

# supervise <name> <command...>: restart with backoff; give up after a crash loop.
supervise() {
    local name="$1"
    shift
    local delay="$BACKOFF_START_S"
    local -a exits=()
    while true; do
        echo "[$name] starting"
        local started
        started=$(date +%s)
        "$@"
        local status=$?
        local now
        now=$(date +%s)
        echo "[$name] exited with status $status"

        # Keep only exits inside the window, then add this one.
        local -a recent=()
        local t
        for t in "${exits[@]}"; do
            if [ $((now - t)) -lt "$RESTART_WINDOW_S" ]; then recent+=("$t"); fi
        done
        recent+=("$now")
        exits=("${recent[@]}")

        if [ "${#exits[@]}" -gt "$MAX_RESTARTS" ]; then
            echo "[$name] crashed ${#exits[@]} times in ${RESTART_WINDOW_S}s; giving up" >&2
            return 1
        fi

        # A run that stayed up for a while resets the backoff.
        if [ $((now - started)) -ge 60 ]; then delay="$BACKOFF_START_S"; fi
        echo "[$name] restarting in ${delay}s"
        sleep "$delay"
        delay=$((delay * 2))
        if [ "$delay" -gt "$BACKOFF_MAX_S" ]; then delay="$BACKOFF_MAX_S"; fi
    done
}

run_arb_bot() { supervise arb_bot /app/arb_test; }
run_redemption() { supervise redemption bash -c 'cd /app/ts && exec bun run src/services/redemption-service.ts'; }

cleanup() {
    echo "Shutting down services..."
    kill "$ARB_PID" "$REDEMPTION_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

run_arb_bot &
ARB_PID=$!
run_redemption &
REDEMPTION_PID=$!
echo "[main] arb_bot supervisor PID $ARB_PID, redemption supervisor PID $REDEMPTION_PID"

# If either supervisor gives up, stop everything and fail the container.
wait -n
status=$?
echo "[main] a supervisor exited with status $status; stopping the other service" >&2
kill "$ARB_PID" "$REDEMPTION_PID" 2>/dev/null || true
wait 2>/dev/null || true
exit "${status:-1}"
