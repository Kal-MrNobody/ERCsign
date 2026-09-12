#!/usr/bin/env bash
# Fetch the pinned third-party toolchain RedFlag_Trail builds on.
# Idempotent: re-running is cheap and safe.
set -euo pipefail

SUBSTREAMS_VERSION="${SUBSTREAMS_VERSION:-1.16.6}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$REPO_ROOT/vendor"
mkdir -p "$VENDOR"

# --- substreams CLI ----------------------------------------------------------
if command -v substreams >/dev/null 2>&1; then
  echo "substreams already installed: $(substreams --version)"
else
  echo "Installing substreams CLI v${SUBSTREAMS_VERSION}..."
  tmp="$(mktemp -d)"
  curl -sSLf --max-time 120 \
    "https://github.com/streamingfast/substreams/releases/download/v${SUBSTREAMS_VERSION}/substreams_linux_x86_64.tar.gz" \
    -o "$tmp/substreams.tgz"
  tar xzf "$tmp/substreams.tgz" -C "$tmp" substreams
  install -m755 "$tmp/substreams" /usr/local/bin/substreams
  rm -rf "$tmp"
  echo "Installed: $(substreams --version)"
fi

# --- prebuilt Substreams packages -------------------------------------------
# NOTE: fetched from raw.githubusercontent.com, NOT api.github.com. The GitHub
# API is scoped to session repositories and 403s on third-party repos; the raw
# host and the releases CDN are not. See NOTES.md 4.2.
fetch_spkg() {
  local name="$1" url="$2"
  if [ -s "$VENDOR/$name" ]; then
    echo "$name already present ($(wc -c < "$VENDOR/$name") bytes)"
  else
    echo "Fetching $name..."
    curl -sSLf --max-time 120 "$url" -o "$VENDOR/$name"
  fi
}

PINAX_RAW="https://raw.githubusercontent.com/pinax-network/substreams-evm/main/spkg"

# Core packages papertrail composes.
fetch_spkg "x402-v0.1.0.spkg"                      "$PINAX_RAW/x402-v0.1.0.spkg"
fetch_spkg "erc20-tokens-v0.4.0.spkg"              "$PINAX_RAW/erc20-tokens-v0.4.0.spkg"
fetch_spkg "substreams-database-change-v2.0.0.spkg" "$PINAX_RAW/substreams-database-change-v2.0.0.spkg"

# Reference only: evm-transfers is the db_out template we model papertrail on
# (see NOTES.md 5.5). Not composed into our pipeline.
fetch_spkg "evm-transfers-v0.5.0.spkg"             "$PINAX_RAW/evm-transfers-v0.5.0.spkg"

echo
echo "--- verifying packages ---"
for f in "$VENDOR"/*.spkg; do
  [ -e "$f" ] || continue
  echo "== $(basename "$f")"
  substreams info "$f" 2>&1 | grep -E '^(Package name|Version|Name|Kind|Output Type|Hash):' || true
done
