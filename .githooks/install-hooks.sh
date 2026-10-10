#!/bin/sh
# Arm the pre-push guard in this clone (core.hooksPath is local config, so it can't be committed).
git config core.hooksPath .githooks && chmod +x .githooks/pre-push && echo "pre-push hook armed"
