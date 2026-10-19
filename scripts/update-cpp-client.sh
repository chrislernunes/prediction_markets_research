#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${repo_root}/cpp/build"
# Leave POLYMARKET_CLIENT_GIT_TAG unset to use the commit pinned in cpp/CMakeLists.txt.
# Set it (tag, branch or commit) to try another SDK version, then pin the commit you keep.
git_ref="${POLYMARKET_CLIENT_GIT_TAG:-}"

rm -rf \
  "${build_dir}/_deps/polymarket_client-src" \
  "${build_dir}/_deps/polymarket_client-build" \
  "${build_dir}/_deps/polymarket_client-subbuild"

cmake -S "${repo_root}/cpp" -B "${build_dir}" \
  -DCMAKE_BUILD_TYPE="${CMAKE_BUILD_TYPE:-Release}" \
  ${git_ref:+-DPOLYMARKET_CLIENT_GIT_TAG="${git_ref}"} \
  -DPOLYARB_FETCH_UPDATES=ON \
  '-UOPENSSL_*'

cmake --build "${build_dir}" --target discovery_mode polymarket_arb -j "${JOBS:-4}"
