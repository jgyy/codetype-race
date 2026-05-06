#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mapfile -t files < <(git ls-files --cached --others --exclude-standard \
    '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' \
    '*.json' '*.yaml' '*.yml' '*.toml' '*.css' '*.sh' \
    ':!:bun.lock' ':!:**/package-lock.json')

total=0
declare -a rows=()
for f in "${files[@]}"; do
    n=$(wc -l <"$f")
    total=$((total + n))
    rows+=("$(printf '%8d  %s' "$n" "$f")")
done

printf '%8s  %s\n' "LINES" "FILE"
printf '%8s  %s\n' "-----" "----"
printf '%s\n' "${rows[@]}" | sort -rn
printf '%8s  %s\n' "-----" "----"
printf '%8d  TOTAL (%d files)\n' "$total" "${#files[@]}"
