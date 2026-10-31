# Project instructions

## Project

Generic, language-agnostic starting point for new repositories in the `lengors-labs`
organization. It carries the repository-level content that `lengors-labs/.github`
cannot supply — code owners, license, README, these instructions and the release
pipeline — and is consumed through GitHub's "Use this template" feature rather than
by branching.

No package manager or build system. Changes are Markdown, YAML and one JavaScript
configuration file for semantic-release; there is no test suite. Verify a change by
reviewing the rendered Markdown and by parsing the YAML and JavaScript for syntax
errors (`node --check .releaserc.js`), and, when references are touched, by following
the linked paths in the `lengors-labs` organization.

Note: every generated repository starts from this content, so treat edits here as
changes to the baseline of all future projects. Keep files generic — nothing specific
to a language, framework or program type belongs in this repository.

## Branching and worktree setup

Two permanent branches exist: `main` (released code only) and `rc` (the integration
branch). Everything else is short-lived.

- **`rc` must already exist.** If it does not, stop and ask the user to create it. Do
  not create it yourself, and do not continue with other work while it is missing —
  the branch is the prerequisite for everything the release pipeline does.
- **Always branch from `rc`, never from `main`.** A new branch that starts at `main`
  is missing every unreleased change on the integration branch.
- **Immediately after creating the worktree, check that the branch is up to date with
  `main`.** If `main` has commits the branch does not, merge `main` into the branch
  and follow the commit conventions for the merge commit (`🔀 Merge \`origin/main\`
  into \`origin/<branch>\``). Doing this first keeps the eventual promotion a
  fast-forward instead of a conflict resolution.

## Commit conventions (gitmoji + semver)

Always commit with gitmoji: `<gitmoji> <short message>` — a single-line subject, no body.
The emoji determines the semantic-release bump, so pick it by the *impact* of the change.

**Major (breaking):**
- 💥 `:boom:` — Introduce breaking changes. If a removal or other change is breaking, use 💥 instead of the "normal" emoji for that change type.

**Minor:**
- ✨ `:sparkles:` — Introduce new features.
- 🗑️ `:wastebasket:` — Deprecate code that needs to be cleaned up (still works; actual removal later = 💥 major).

**Patch:**
- 🐛 `:bug:` — Fix a bug.
- ✏️ `:pencil2:` — Fix typos.
- 🔒 `:lock:` — Fix security or privacy issues.
- 🔐 `:closed_lock_with_key:` — Add or update secrets.
- 🚑️ `:ambulance:` — Critical hotfix.
- ⚡️ `:zap:` — Improve performance.
- ♻️ `:recycle:` — Refactor code (no behavior change).
- 💄 `:lipstick:` — Add or update the UI and style files.
- ➕ `:heavy_plus_sign:` — Add a dependency.
- ➖ `:heavy_minus_sign:` — Remove a dependency.
- ⬆️ `:arrow_up:` — Upgrade dependencies.
- ⬇️ `:arrow_down:` — Downgrade dependencies.
- 📌 `:pushpin:` — Pin dependencies to specific versions.
- 🔧 `:wrench:` — Add or update configuration files.
- 👷 `:construction_worker:` — Add or update CI build system. **Spell the glyph as
  👷‍♂️ in commits**: `semantic-release-gitmoji` resolves rules through `node-emoji`,
  which does not know the bare codepoint, so a plain 👷 prefix yields no release.
- 💚 `:green_heart:` — Fix CI Build.
- 🍱 `:bento:` — Add or update assets.
- 📦 `:package:` — Add or update compiled files or packages.
- 🥅 `:goal_net:` — Catch errors.
- 🔊 `:loud_sound:` — Add or update logs.
- 🔇 `:mute:` — Remove logs.
- 📱 `:iphone:` — Work on responsive design.
- 🔥 `:fire:` — Remove code or files (non-breaking; if breaking → 💥 major).

**No release triggered:**
- 📝 `:memo:` — Add or update documentation.
- 🎨 `:art:` — Improve structure / format of the code.
- ✅ `:white_check_mark:` — Add, update, or pass tests.
- 🧪 `:test_tube:` — Add a failing test.
- 💸 `:money_with_wings:` — Add sponsorships or money related infrastructure.
- 📄 `:page_facing_up:` — Add or update license.
- 🙈 `:see_no_evil:` — Add or update a .gitignore file.
- 💡 `:bulb:` — Add or update comments in source code.

Rules of thumb:
- "Does this break consumers?" Yes → 💥. No → use the specific emoji above.
- Deprecation is minor; actual removal is major.
- When in doubt between two emojis, prefer the one describing *what changed*, not why.

**Grouping:** one logically coherent concern per commit — if a single issue or request spans multiple features/fixes/chores, make one commit per unit. Tests go in their own ✅ commit (separate from the implementation they cover). If you find yourself wanting two different gitmoji for one change, split it into separate commits.

**No fix-up commits for work in the same session.** Rewrite the unmerged commit that
introduced the mistake (`git commit --amend`, or an interactive rebase when it is
further back) instead of adding a second commit that corrects it. A `✏️` or `🐛`
commit whose only purpose is to fix something added earlier on the same branch is a
defect in the history, not a fix: it leaves both the wrong and the right version in
review. When the branch is already pushed this requires a force-push, which is
authorised in that case (see Git & GitHub safety).

**Verify the commit identity before every commit.** Git configuration can be
overridden by `GIT_AUTHOR_*` and `GIT_COMMITTER_*` environment variables, which
silently win and outlive the command that set them. Never trust the config: confirm
with `git var GIT_AUTHOR_IDENT` before committing, scope any such override to the
command that needs it, and undo it afterwards.

## Release pipeline

`.releaserc.js` derives the bump from the gitmoji table above and publishes a GitHub
release on every push to `main` and `rc`, so `rc` yields `x.y.z-rc.n` and `main`
yields the final version. The version lives in the git tag; do not bump or edit
versions by hand, and do not edit `CHANGELOG` files or tags.

A manual dispatch of the same workflow publishes a preview from a `feat/`, `bug/` or
`chore/` branch — `x.y.z-preview-<branch>.1`, on the `preview` channel. That is the
only way those branches release; pushing to them does nothing. Nothing is committed
by any of these runs, so a preview leaves only a tag and a release behind.

Promotion is a merge of `rc` into `main`, and the repository's branch rules make it
the one place drift is resolved: `rc` must contain `main` before it can be promoted,
and nothing else may merge into `main`. `main` therefore never runs ahead, and any
conflict between the two is forced to be settled in the promotion PR rather than
left to rot.

## Pull request conventions

When creating any pull request:
- Title format: 🔀 Merge `origin/<source_branch>` into `origin/<target_branch>` (backtick the branch refs, exactly this wording).
- Body: leave **empty** — do not pass a body.
- Assignee: set to yourself — the authenticated account (via `get_me`; if unavailable, resolve from git config user.email via search_users — note noreply emails are NOT indexed by search — or ask for the username instead of guessing). (`create_pull_request` has no assignee parameter and GitHub does not auto-assign authors on API-created PRs — set it post-creation with issue-update tooling.)

## Issue & PR linking

- Never use closing keywords (`Closes`, `Fixes`, `Resolves`) in commit messages or PR titles/bodies. Plain `#<number>` references are fine for cross-referencing.
- Never close issues manually; leave issue state to the user (they may link via the PR's Development sidebar — manual links auto-close on merge — or close it themselves).

## Git & GitHub safety

- **Never force-push a branch you did not create, and never force-push a branch that
  has already been merged.** Beyond that, a force-push is allowed when the user asks
  for it in the same session — and it is the expected mechanism for the no-fix-up
  rule above: rewrite the unmerged commit and push it with `--force-with-lease`
  rather than leaving a defective commit in the history. Never use plain `--force`.
- Never delete branches, worktrees, or tags without explicit user confirmation. A worktree and the local branch checked out in it are one unit: when the user confirms deleting a worktree, that confirmation also covers its associated branch — remove the worktree first (`git worktree remove <path>`), then delete the branch (`git branch -d <branch>`). Use plain `-d`, never `-D`: if the branch has unmerged commits and deletion is refused, report it instead of force-deleting. Deleting a standalone branch (no worktree involved) still requires explicit confirmation naming that branch.
- If a GitHub API/tool call fails, stop and report the error — do not retry destructively.
- Ask before acting whenever identification is ambiguous (which issue, which project, which account).