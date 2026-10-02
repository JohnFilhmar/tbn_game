#!/usr/bin/env bash
# The fixed script every system git job runs inside the sandbox image. The worker chooses the
# operation and validates its arguments; this script re-checks branch names, applies the branch
# rules it is told, and never takes a command from an agent. Text an agent wrote, such as a merge
# message, arrives in TBN_MESSAGE, never on the command line.
#
# Mounts: the canonical bare repository at /repo, and for operations that read an agent's checkout,
# that checkout at /work. Exit codes: 0 done, 2 refused, 3 merge conflict, 1 anything else.
set -euo pipefail

readonly REPO=/repo
readonly WORK=/work
readonly DIFF_LIMIT_BYTES=${TBN_DIFF_LIMIT_BYTES:-200000}

refuse() {
  echo "refused: $*" >&2
  exit 2
}

check_branch() {
  local name=$1
  if [[ ! "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ || "$name" == *..* || "$name" == *//* ||
    "$name" == */ || "$name" == *. || "$name" == *.lock || "$name" == *"@{"* ]]; then
    refuse "invalid branch name $name"
  fi
}

check_sha() {
  [[ "$1" =~ ^[0-9a-f]{7,40}$ ]] || refuse "invalid commit $1"
}

# A fresh identity for commits this script makes. Agents commit in their own checkouts.
export GIT_AUTHOR_NAME=${TBN_GIT_NAME:-tbn}
export GIT_AUTHOR_EMAIL=${TBN_GIT_EMAIL:-tbn@localhost}
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL
export GIT_CONFIG_NOSYSTEM=1

# A commit the merge operations make in a temporary worktree of the bare repository.
with_worktree() {
  local branch=$1
  local dir
  dir=$(mktemp -d /tmp/wt.XXXXXX)
  git -C "$REPO" worktree add --quiet "$dir" "$branch" >/dev/null
  echo "$dir"
}

drop_worktree() {
  git -C "$REPO" worktree remove --force "$1" >/dev/null 2>&1 || true
  git -C "$REPO" worktree prune >/dev/null 2>&1 || true
}

merge_into() {
  local source=$1 target=$2 expected=$3
  check_branch "$source"
  check_branch "$target"
  check_sha "$expected"
  local actual
  actual=$(git -C "$REPO" rev-parse "refs/heads/$source")
  [[ "$actual" == "$expected"* ]] || refuse "$source moved to $actual since the review of $expected"
  local dir
  dir=$(with_worktree "$target")
  if ! git -C "$dir" merge --no-ff --no-edit -m "${TBN_MESSAGE:-Merge $source into $target}" \
    "refs/heads/$source" >/dev/null 2>&1; then
    git -C "$dir" merge --abort >/dev/null 2>&1 || true
    drop_worktree "$dir"
    echo "conflict: $source does not merge cleanly into $target" >&2
    exit 3
  fi
  local merged
  merged=$(git -C "$dir" rev-parse HEAD)
  drop_worktree "$dir"
  echo "$merged"
}

operation=${1:-}
shift || true

case "$operation" in
  init)
    # init <default_branch>: an empty canonical repository with the default branch and development.
    check_branch "$1"
    git init --quiet --bare --initial-branch="$1" "$REPO"
    scratch=$(mktemp -d /tmp/init.XXXXXX)
    git init --quiet --initial-branch="$1" "$scratch"
    git -C "$scratch" commit --quiet --allow-empty -m "Initial commit"
    git -C "$scratch" push --quiet "$REPO" "HEAD:refs/heads/$1" "HEAD:refs/heads/development"
    rm -rf "$scratch"
    git -C "$REPO" rev-parse "refs/heads/$1"
    ;;
  clone_remote)
    # clone_remote <url> <default_branch>: mirror a public remote; development starts from its default.
    check_branch "$2"
    git clone --quiet --bare "$1" "$REPO"
    git -C "$REPO" remote set-url --push origin no_push
    git -C "$REPO" rev-parse --verify --quiet "refs/heads/$2" >/dev/null || refuse "the remote has no branch $2"
    git -C "$REPO" rev-parse --verify --quiet refs/heads/development >/dev/null ||
      git -C "$REPO" branch development "refs/heads/$2"
    git -C "$REPO" rev-parse "refs/heads/$2"
    ;;
  fetch_remote)
    # fetch_remote <default_branch>: refresh the default branch from the remote. Nothing is pushed.
    check_branch "$1"
    git -C "$REPO" fetch --quiet --no-tags origin "+refs/heads/$1:refs/heads/$1"
    git -C "$REPO" rev-parse "refs/heads/$1"
    ;;
  checkout)
    # checkout <branch> <base_branch>: the agent's clone at /work on <branch>, created from <base>
    # when neither the clone nor the canonical repository has it. Local work is kept.
    check_branch "$1"
    check_branch "$2"
    if [[ ! -d "$WORK/.git" ]]; then
      git clone --quiet --no-hardlinks "$REPO" "$WORK"
      git -C "$WORK" remote remove origin
      git -C "$WORK" config user.name "$GIT_AUTHOR_NAME"
      git -C "$WORK" config user.email "$GIT_AUTHOR_EMAIL"
    fi
    git -C "$WORK" fetch --quiet --no-tags "$REPO" '+refs/heads/*:refs/remotes/canonical/*'
    if git -C "$WORK" rev-parse --verify --quiet "refs/heads/$1" >/dev/null; then
      git -C "$WORK" checkout --quiet "$1"
    elif git -C "$WORK" rev-parse --verify --quiet "refs/remotes/canonical/$1" >/dev/null; then
      git -C "$WORK" checkout --quiet -b "$1" "refs/remotes/canonical/$1"
    else
      git -C "$WORK" checkout --quiet -b "$1" "refs/remotes/canonical/$2"
    fi
    git -C "$WORK" rev-parse HEAD
    ;;
  publish)
    # publish <branch> <allowed>...: fast-forward the canonical branch to the checkout's, only for a
    # branch in the allowed list the worker computed for this agent.
    branch=$1
    shift
    check_branch "$branch"
    allowed=no
    for candidate in "$@"; do
      [[ "$candidate" == "$branch" ]] && allowed=yes
    done
    [[ "$allowed" == yes ]] || refuse "this agent may not write $branch"
    git -C "$WORK" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null ||
      refuse "the checkout has no branch $branch"
    git -C "$REPO" fetch --quiet --no-tags "$WORK" "refs/heads/$branch:refs/heads/$branch"
    git -C "$REPO" rev-parse "refs/heads/$branch"
    ;;
  rev)
    # rev <branch>: the commit a canonical branch is at.
    check_branch "$1"
    git -C "$REPO" rev-parse "refs/heads/$1"
    ;;
  branches)
    git -C "$REPO" for-each-ref --format='%(refname:short) %(objectname:short)' refs/heads
    ;;
  log)
    # log <base> <head>: commits on head that base lacks.
    check_branch "$1"
    check_branch "$2"
    git -C "$REPO" log --no-decorate --format='%h %an %s' "refs/heads/$1..refs/heads/$2"
    ;;
  diff)
    # diff <base> <head>: the change head makes on base, capped.
    check_branch "$1"
    check_branch "$2"
    git -C "$REPO" diff --stat "refs/heads/$1...refs/heads/$2"
    echo
    git -C "$REPO" diff "refs/heads/$1...refs/heads/$2" | head -c "$DIFF_LIMIT_BYTES"
    ;;
  merge_feature)
    # merge_feature <feature> <manager_branch> <reviewed_sha>: a manager merges a reviewed feature.
    merge_into "$1" "$2" "$3"
    ;;
  merge_to_development)
    # merge_to_development <manager_branch> <head_sha>: the owner merges a merge request.
    merge_into "$1" development "$2"
    ;;
  *)
    refuse "unknown operation ${operation:-(none)}"
    ;;
esac
