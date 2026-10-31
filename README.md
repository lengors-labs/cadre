# Welcome to Template &middot; [![GitHub license](https://img.shields.io/github/license/lengors-labs/template?color=blue)](https://github.com/lengors-labs/template/blob/main/LICENSE)

Welcome to **template**, the generic, language-agnostic starting point for new
repositories in the [`lengors-labs`](https://github.com/lengors-labs) organization.

This template is deliberately minimal. Most of the organization's conventions are
maintained once in [`lengors-labs/.github`](https://github.com/lengors-labs/.github)
and inherited automatically by every repository that does not override them. What
remains here is the content that **cannot** be inherited, plus the files that make
this repository usable as a template.

## What's in here

- `README.md` — this file: the project's introduction and usage notes.
- `LICENSE` — [The Unlicense](./LICENSE), placing the project in the public domain.
- `AGENTS.md` — project instructions for AI agents: commit conventions, pull
  request conventions, issue and pull request linking policy, and Git/GitHub
  safety rules.
- `.releaserc.js` — the release pipeline: gitmoji commits become versions,
  changelogs and GitHub releases.
- `.github/workflows/publish-new-version.yml` — GitHub Actions workflow that runs it.
- `.github/CODEOWNERS` — default code owners for the repository.

## What's inherited

These files live in [`lengors-labs/.github`](https://github.com/lengors-labs/.github)
and apply to this repository without being duplicated here:

- `CODE_OF_CONDUCT.md` — our code of conduct.
- `CONTRIBUTING.md` — contribution guidelines.
- `SECURITY.md` — security policy.
- `SUPPORT.md` — support resources.
- `.github/FUNDING.yml` — sponsorship configuration.
- `.github/ISSUE_TEMPLATE/` — issue forms and issue configuration.
- `.github/PULL_REQUEST_TEMPLATE.md` — default pull request template.

Do not copy them into this repository: an override would silently freeze that file
at the version it was taken from, and future organization-wide updates would no
longer reach generated projects.

## Getting started

1. Click **Use this template** at the top of this repository, or open
   <https://github.com/lengors-labs/template/generate>.
2. Choose the owner and name of the new repository.
3. Replace the contents of this `README.md` with a description of your project.
4. Adjust `.github/CODEOWNERS` if the maintainers differ from the defaults.
5. Add the secrets the release workflow needs to the `publisher` environment:
   `GH_APP_ID` and `GH_PRIVATE_KEY` for the GitHub App that performs the release.
   The workflow signs nothing, so no GPG key is required.
6. Update the **Project** section of `AGENTS.md` with the description, package
   manager, and any globally relevant scripts of the new project.

Do not fork or clone this repository as a starting point, and do not branch from
`main` to begin a project. Using it as a template produces a new repository with a
fresh history, which is what you want; a fork keeps a dependency on this repository
that is never useful.

## Releasing

Every project generated from this template starts with a working release pipeline.
There are two permanent branches, and two ways to release:

| Branch | Role | Version produced | How |
| :--- | :--- | :--- | :--- |
| `main` | Default. Contains released code only. | `1.2.0` | push |
| `rc` | Integration branch. Work merges here first. | `1.2.0-rc.1` | push |
| `feat/**`, `bug/**`, `chore/**` | Topic branches, cut from `rc`. | `1.2.0-preview-<branch>.1` | manual dispatch |

Topic branches are cut from `rc`; promoting `rc` into `main` produces the final
release. Pushing to a topic branch does nothing — its preview is published on demand
from the Actions tab, which is useful for trying a build without cutting an `rc`.

The bump is derived from the commit's gitmoji, the changelog and GitHub release are
generated from the same commits, and the version lives in the git tag — nothing is
written into a file. See the comment block at the end of [`.releaserc.js`](./.releaserc.js)
for how a language template adds its own build tool to the pipeline.

## Contributing

Contributions are welcome! Please refer to our [Contribution Guidelines](https://github.com/lengors-labs/.github/blob/main/CONTRIBUTING.md)
for more information on how to get involved, including the commit and pull request
conventions enforced by this repository (also documented in [`AGENTS.md`](./AGENTS.md)).

## License

This project is licensed under [The Unlicense](./LICENSE), which places it in the
public domain.
