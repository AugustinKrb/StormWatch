# Contributing

## Prerequisites

This project uses [mise](https://mise.jdx.dev/installing-mise.html) (tool
versions + task runner) and [uv](https://docs.astral.sh/uv/getting-started/installation/)
(Python packaging). Install both, then `cd` into the repo — mise picks up
the Python/Node versions from `.mise.toml` automatically.

## Setup

```bash
git clone https://github.com/AugustinKrb/StormWatch.git
cd StormWatch
uv sync
npm ci
mise run precommit-install
```

`precommit-install` sets up the git hook so every commit is checked
automatically from then on.

## Before opening a PR

```bash
mise run precommit-run
```

Runs everything CI runs: ruff, pylint, eslint, stylelint, htmlhint,
hadolint, yamllint, gitleaks.

## Commit / PR title convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:`, ...) — PR titles are checked in CI and
become the changelog entry via release-please. Merged PRs are squashed, so
the individual commits inside a PR don't need to follow the convention, only
the PR title does.

## Docs

```bash
mise run run-doc
```

Serves the MkDocs site locally at
[http://127.0.0.1:8000](http://127.0.0.1:8000) with hot reload.
