#!/usr/bin/env bash
# Initial bulk push: pushes commits in batches, resumable from where remote left off
# Usage: ./push.sh <repo_path> [batch_size]
# Example: ./push.sh /home/ubuntu/dev/legalize-jp 1000

set -e

REPO=${1:?Usage: ./push.sh <repo_path> [batch_size]}
BATCH=${2:-1000}
REMOTE=origin
BRANCH=main

cd "$REPO"
echo "Repo: $REPO"
echo "Collecting commits..."
mapfile -t COMMITS < <(git rev-list --reverse HEAD)
TOTAL=${#COMMITS[@]}
echo "Total local commits: $TOTAL (batch size: $BATCH)"

# Find where remote currently is
REMOTE_SHA=$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" | awk '{print $1}')
START=0

if [[ -n "$REMOTE_SHA" ]]; then
  echo "Remote is at: $REMOTE_SHA"
  for ((i = 0; i < TOTAL; i++)); do
    if [[ "${COMMITS[$i]}" == "$REMOTE_SHA" ]]; then
      START=$((i + 1))
      break
    fi
  done
  echo "Resuming from commit $START/$TOTAL"
else
  echo "Remote branch not found, starting from beginning"
fi

if [[ $START -ge $TOTAL ]]; then
  echo "Already up to date."
  exit 0
fi

# Push in batches starting from START
for ((i = START + BATCH - 1; i < TOTAL; i += BATCH)); do
  SHA="${COMMITS[$i]}"
  echo "Pushing up to commit $((i + 1))/$TOTAL ($SHA)..."
  git push --force "$REMOTE" "${SHA}:refs/heads/${BRANCH}"
done

# Final push
echo "Final push..."
git push --force "$REMOTE" "HEAD:refs/heads/${BRANCH}"
echo "Done. $TOTAL commits pushed."
