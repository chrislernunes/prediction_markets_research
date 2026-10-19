#!/usr/bin/env bash
# Repository hygiene checks, run in CI (`bun run check:repo`). Fails on:
#   - zero-byte tracked files (they hid broken includes and dead stubs before)
#   - C++ sources outside cpp/
#   - hard-coded contract addresses outside the two contracts modules (the zero address and
#     the two signing-fixture files, which embed a public test key's address, are allowed)
#   - files that should be executable but are not
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  list_files() { git ls-files; }
else
  list_files() { find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './cpp/build/*' | sed 's#^\./##'; }
fi

failures=0
fail() { echo "FAIL: $*" >&2; failures=$((failures + 1)); }

while IFS= read -r file; do
  [ -f "$file" ] || continue
  if [ ! -s "$file" ] && [ "$(basename "$file")" != ".gitkeep" ]; then
    fail "zero-byte file: $file"
  fi
  case "$file" in
    cpp/* | */Dockerfile.*) ;;
    *.cpp | *.hpp | *.h | *.cc) fail "C++ source outside cpp/: $file" ;;
  esac
  case "$file" in
    src/core/contracts.ts | cpp/include/contracts.hpp | tests/* | cpp/tests/* | docs/* | *.md | bun.lock) ;;
    cpp/apps/execution/order_test.cpp | src/cli/execution/signing-test.ts) ;;
    *.ts | *.cpp | *.hpp | *.sh | *.yml)
      if grep -oE '0x[0-9a-fA-F]{40}' "$file" 2>/dev/null | grep -vE '^0x0{40}$' >/dev/null; then
        fail "hard-coded address in $file (use src/core/contracts.ts or cpp/include/contracts.hpp)"
      fi
      ;;
  esac
done < <(list_files)

for script in deploy/*.sh scripts/*.sh; do
  [ -x "$script" ] || fail "not executable: $script"
done

if [ "$failures" -gt 0 ]; then
  echo "$failures repository check(s) failed" >&2
  exit 1
fi
echo "repository checks passed"
