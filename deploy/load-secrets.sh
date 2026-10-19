#!/bin/bash
# Sourced by the container entrypoints. If PRIVATE_KEY is not already set and
# PRIVATE_KEY_SECRET names a Secret Manager version
# (projects/<project>/secrets/<name>/versions/<version|latest>), fetch it using the
# VM's service account so the key never appears in instance metadata or `docker inspect`.

load_private_key_from_secret_manager() {
    if [ -n "${PRIVATE_KEY:-}" ] || [ -z "${PRIVATE_KEY_SECRET:-}" ]; then
        return 0
    fi

    local token_json token payload_json encoded
    token_json=$(curl -fsS -H 'Metadata-Flavor: Google' \
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token') || {
        echo "[secrets] could not reach the metadata server for a token" >&2
        return 1
    }
    token=$(printf '%s' "$token_json" | sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p')
    if [ -z "$token" ]; then
        echo "[secrets] metadata server returned no access token" >&2
        return 1
    fi

    payload_json=$(curl -fsS -H "Authorization: Bearer ${token}" \
        "https://secretmanager.googleapis.com/v1/${PRIVATE_KEY_SECRET}:access") || {
        echo "[secrets] Secret Manager access failed for ${PRIVATE_KEY_SECRET} (check the service account's secretAccessor role and the VM's cloud-platform scope)" >&2
        return 1
    }
    encoded=$(printf '%s' "$payload_json" | sed -n 's/.*"data" *: *"\([^"]*\)".*/\1/p')
    if [ -z "$encoded" ]; then
        echo "[secrets] Secret Manager response had no payload" >&2
        return 1
    fi
    PRIVATE_KEY=$(printf '%s' "$encoded" | tr '_-' '/+' | base64 -d | tr -d '\r\n')
    export PRIVATE_KEY
    echo "[secrets] private key loaded from Secret Manager"
}

# Live trading needs two explicit opt-ins, so a stray DRY_RUN=false cannot move money by itself.
require_live_confirmation() {
    if [ "${DRY_RUN:-true}" = "false" ] && [ "${CONFIRM_LIVE_TRADING:-}" != "yes" ]; then
        echo "[safety] DRY_RUN=false requires CONFIRM_LIVE_TRADING=yes. Refusing to start." >&2
        return 64
    fi
    if [ "${DRY_RUN:-true}" = "false" ]; then
        echo "[safety] LIVE TRADING ENABLED (DRY_RUN=false, CONFIRM_LIVE_TRADING=yes)" >&2
    else
        echo "[safety] dry run: no orders or transactions will be sent"
    fi
}
