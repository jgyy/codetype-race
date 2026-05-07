#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mapfile -t files < <(git ls-files --cached --others --exclude-standard \
    '*.ts' '*.tsx' '*.js' '*.cjs' '*.mjs' \
    '*.css' '*.html' \
    '*.yaml' '*.yml' '*.toml' '*.json' '*.sh' \
    ':!:bun.lock' ':!:**/package-lock.json' \
    ':!:cdk.out/**' ':!:**/cdk.out/**' \
    ':!:**/dist/**' ':!:**/build/**' ':!:**/.next/**' ':!:**/coverage/**' \
    ':!:**/*.min.*' ':!:**/*.d.ts' \
    ':!:**/*.generated.*' ':!:**/*.gen.*' ':!:**/__generated__/**' \
    ':!:**/*-lock.json' ':!:**/*.lockb')

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
