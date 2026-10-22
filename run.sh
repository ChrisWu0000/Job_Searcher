#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv-litellm"

if [[ ! -d "$VENV" ]]; then
  if [[ -n "${PYTHON:-}" ]]; then
    python_command=("$PYTHON")
  elif command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then
    python_command=(python3)
  elif command -v python >/dev/null 2>&1 && python --version >/dev/null 2>&1; then
    python_command=(python)
  elif command -v py >/dev/null 2>&1; then
    python_command=(py -3)
  else
    printf 'Python is required. Install Python 3.12 and rerun bash run.sh.\n' >&2
    exit 1
  fi
  printf 'Creating the local LiteLLM Python environment...\n'
  "${python_command[@]}" -m venv "$VENV"
fi

if [[ -x "$VENV/Scripts/python.exe" ]]; then
  VENV_PYTHON="$VENV/Scripts/python.exe"
elif [[ -x "$VENV/bin/python" ]]; then
  VENV_PYTHON="$VENV/bin/python"
else
  printf 'The environment at %s has no Python executable. Rename it and retry.\n' "$VENV" >&2
  exit 1
fi

if ! "$VENV_PYTHON" -c 'import litellm.proxy.proxy_cli' >/dev/null 2>&1; then
  printf 'Installing LiteLLM and its proxy dependencies...\n'
  "$VENV_PYTHON" -m pip install 'litellm[proxy]'
fi

printf 'Checking GitHub Copilot authorization. Follow any device sign-in instructions below.\n'
"$VENV_PYTHON" -c 'from litellm.llms.github_copilot.authenticator import Authenticator; Authenticator().get_access_token()'

export LITELLM_DANGEROUSLY_PERMIT_WEAK_OR_UNSET_MASTER_KEY=true
printf 'Starting the AI proxy at http://127.0.0.1:4000. Keep this terminal open; press Ctrl+C to stop.\n'
exec "$VENV_PYTHON" -m litellm.proxy.proxy_cli \
  --model github_copilot/gpt-6-luna \
  --host 127.0.0.1 \
  --port 4000
