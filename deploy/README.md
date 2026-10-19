# deploy/

| File | Purpose |
| --- | --- |
| `Dockerfile.cpp` | C++ `arb_test` image |
| `Dockerfile.combined` | C++ bot plus TypeScript redemption service under one supervisor |
| `docker-compose.yml` | Local run of the C++ image |
| `entrypoint-cpp.sh`, `entrypoint.sh` | Container entrypoints: safety check, secret loading, supervision |
| `load-secrets.sh` | Shared helpers sourced by both entrypoints |
| `deploy-gcloud.sh` | Build, push and deploy the C++ image to a GCE VM |

Build from the repository root so the build context contains `cpp/`, `src/` and `deploy/`:

```bash
docker build -f deploy/Dockerfile.cpp -t poly-arb-cpp .
docker compose --env-file .env -f deploy/docker-compose.yml up --build
```

## Safe by default

- Images default to `DRY_RUN=true`. `DRY_RUN=false` also requires `CONFIRM_LIVE_TRADING=yes`,
  otherwise the entrypoint exits with status 64 before touching any key.
- The combined entrypoint restarts a crashed service with exponential backoff and stops the
  container (non-zero) after `MAX_RESTARTS` (5) exits within `RESTART_WINDOW_S` (600 s).
- Binaries are built without `-march=native`, so an image built on one machine runs on another.
- Execution paths are legacy CLOB V1 and not validated; read
  [docs/maintenance.md](../docs/maintenance.md) before enabling live trading anywhere.

## Secrets on GCP

`deploy-gcloud.sh` never puts the wallet key in instance metadata or container environment.
The first run reads `PRIVATE_KEY` from your shell once to create a Secret Manager secret
(`SECRET_NAME`, default `poly-arb-private-key`), grants the VM's service account
`roles/secretmanager.secretAccessor` on it, and passes only the secret's resource path
(`PRIVATE_KEY_SECRET`) to the container. The entrypoint fetches the key at start through the
metadata server. The VM needs the `cloud-platform` scope, which the script sets.

This deployment path has not been exercised against a real GCP project; test it with
`DRY_RUN=true` first.
