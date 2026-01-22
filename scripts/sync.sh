#!/bin/bash
# sync.sh - Sync local chartbook updates with server-generated CSV files
#
# This script handles the case where:
# - Local: chartbook.pdf is updated by local automation
# - Remote: gdpm.csv, gdpq.csv, and gdpm_updated.txt are updated by GitHub Actions
#
# Usage: ./scripts/sync.sh [commit message]

set -e  # Exit on error

cd "$(dirname "$0")/.."  # Change to repo root

# Default commit message
COMMIT_MSG="${1:-Updated chartbook}"

echo "Fetching remote changes..."
git fetch origin

echo "Pulling server-generated files..."
git checkout origin/master -- files/gdpm.csv files/gdpq.csv files/gdpm_updated.txt 2>/dev/null || echo "No changes on remote"

# Check if there are any changes to commit
if git diff --quiet && git diff --staged --quiet; then
    echo "No changes to commit."
    exit 0
fi

echo "Staging all changes..."
# Always reset server files to remote right before staging (safety measure)
git checkout origin/master -- files/gdpm.csv files/gdpq.csv files/gdpm_updated.txt
git add .

echo "Committing with message: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "Pushing to remote..."
git push

echo "Sync complete!"
