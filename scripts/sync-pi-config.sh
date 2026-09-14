#!/usr/bin/env bash
# Snapshot shareable files from ~/.pi/agent into this repo's pi-agent/.
# ~/.pi/agent stays the live source. Run this by hand when you want to publish.
set -euo pipefail

SRC="${PI_AGENT_DIR:-$HOME/.pi/agent}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/pi-agent"
DRY_RUN=0

# Only these paths are copied. Everything else in DEST is removed.
FILES=(
  settings.json
  models.json
  mcp.json
  keybindings.json
  AGENTS.md
  package.json
  pi-atelier.json
)

DIRS=(
  extensions
  prompts
  themes
  agents
)

# Filenames skipped inside extensions/.
EXTENSION_EXCLUDE=(
  codeisland.ts
  orca-agent-status.ts
  orca-prefill.ts
  orca-titlebar-spinner.ts
  otty-integration.ts
  skillful-install.json
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dry-run]

Copy the allowlisted Pi config from:
  $SRC
into:
  $DEST

Allowlist:
  files: ${FILES[*]}
  dirs:  ${DIRS[*]}
extensions exclude:
  ${EXTENSION_EXCLUDE[*]}
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
elif [[ $# -gt 0 ]]; then
  usage >&2
  exit 2
fi

if [[ ! -d "$SRC" ]]; then
  echo "Pi config directory not found: $SRC" >&2
  exit 1
fi

allowed() {
  local name="$1"
  local item
  for item in "${FILES[@]}" "${DIRS[@]}"; do
    if [[ "$item" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}

RSYNC=(rsync -a)
if [[ "$DRY_RUN" -eq 1 ]]; then
  RSYNC+=(-n --itemize-changes)
fi

mkdir -p "$DEST"

copied=0
missing=0

for name in "${FILES[@]}"; do
  if [[ ! -e "$SRC/$name" ]]; then
    echo "skip (missing): $name"
    missing=$((missing + 1))
    continue
  fi
  if [[ -L "$SRC/$name" ]]; then
    echo "skip (symlink): $name -> $(readlink "$SRC/$name")"
    continue
  fi
  "${RSYNC[@]}" "$SRC/$name" "$DEST/$name"
  echo "file: $name"
  copied=$((copied + 1))
done

for name in "${DIRS[@]}"; do
  if [[ ! -d "$SRC/$name" ]]; then
    echo "skip (missing): $name/"
    missing=$((missing + 1))
    continue
  fi
  if [[ -L "$SRC/$name" ]]; then
    echo "skip (symlink): $name/ -> $(readlink "$SRC/$name")"
    continue
  fi
  mkdir -p "$DEST/$name"
  extra=()
  if [[ "$name" == "extensions" ]]; then
    for skip in "${EXTENSION_EXCLUDE[@]}"; do
      extra+=(--exclude "$skip")
    done
  fi
  "${RSYNC[@]}" --delete "${extra[@]}" "$SRC/$name/" "$DEST/$name/"
  echo "dir:  $name/"
  copied=$((copied + 1))
done

if [[ -d "$DEST/extensions" ]]; then
  for skip in "${EXTENSION_EXCLUDE[@]}"; do
    if [[ -e "$DEST/extensions/$skip" ]]; then
      echo "remove (excluded): extensions/$skip"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        rm -f "$DEST/extensions/$skip"
      fi
    fi
  done
fi

shopt -s dotglob nullglob
for path in "$DEST"/*; do
  name="$(basename "$path")"
  if allowed "$name"; then
    continue
  fi
  echo "remove (not in allowlist): $name"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    rm -rf "$path"
  fi
done
shopt -u dotglob nullglob

echo
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run only. $copied path(s) would sync, $missing missing."
else
  echo "synced $copied path(s) from $SRC -> $DEST ($missing missing)."
  echo "review with: git -C \"$ROOT\" status --short pi-agent"
fi
