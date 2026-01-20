#!/bin/bash
# sync.sh - Sync local chartbook updates with server-generated CSV files
#
# This script handles the case where:
# - Local: chartbook.pdf is updated by local automation
# - Remote: gdpm.csv and gdpq.csv are updated by GitHub Actions
#
# Usage: ./scripts/sync.sh [commit message]

set -e  # Exit on error

cd "$(dirname "$0")/.."  # Change to repo root

# Default commit message
COMMIT_MSG="${1:-Updated chartbook}"

echo "Fetching remote changes..."
git fetch origin

echo "Pulling server-generated CSV files..."
git checkout origin/master -- files/gdpm.csv files/gdpq.csv 2>/dev/null || echo "No CSV changes on remote"

# Check if there are any changes to commit
if git diff --quiet && git diff --staged --quiet; then
    echo "No changes to commit."
    exit 0
fi

echo "Staging all changes..."
git add .

echo "Committing with message: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "Pushing to remote..."
git push

echo "Sync complete!"
