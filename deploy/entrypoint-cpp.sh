#!/bin/bash
# Entrypoint for the C++-only image: safety checks, optional Secret Manager key, then the bot.
set -euo pipefail

# shellcheck source=/dev/null
. "$(dirname "$0")/load-secrets.sh"

DRY_RUN="${DRY_RUN:-true}"
export DRY_RUN
require_live_confirmation
load_private_key_from_secret_manager

exec /app/arb_test
