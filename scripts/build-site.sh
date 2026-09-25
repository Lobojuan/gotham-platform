#!/usr/bin/env bash
# Build the public site into apps/site/dist
set -euo pipefail
cd "$(dirname "$0")/../apps/site"
python3 build.py
