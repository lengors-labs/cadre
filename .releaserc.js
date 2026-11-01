/**
 * semantic-release configuration for this repository.
 *
 * This layer is deliberately language-agnostic: it turns gitmoji commits into
 * versions, changelogs and GitHub releases and assumes nothing about a build
 * tool. A language template generated from this one is the only place a build
 * tool enters the picture — see the `plugins` array at the bottom of this file.
 */

/**
 * Changelog sections, in the order they are rendered.
 *
 * `rules` lists the glyphs that belong to a section, spelled exactly as
 * `emoji-regex` extracts them from a commit subject — the same key
 * `semantic-release-gitmoji` uses to bucket commits. Two glyphs differ from the
 * spelling in `AGENTS.md` for that reason: 🚑 and ⚡ lose their variation
 * selector, and 👷 must be written 👷‍♂️ (node-emoji does not know the bare
 * codepoint, and the plugin silently drops any rule it cannot resolve).
 */
const SECTIONS = [
  { title: '💥 Breaking Changes', rules: ['💥'] },
  { title: '✨ New Features', rules: ['✨'] },
  { title: '🗑️ Deprecations', rules: ['🗑️'] },
  { title: '🐛 Bug Fixes', rules: ['🐛', '🚑', '🥅'] },
  { title: '🔒 Security', rules: ['🔒', '🔐'] },
  { title: '⚡ Performance', rules: ['⚡'] },
  { title: '♻️ Refactoring and Style', rules: ['♻️', '💄', '✏️'] },
  { title: '📦 Dependencies and Build', rules: ['➕', '➖', '⬆️', '⬇️', '📌', '👷‍♂️', '💚', '🍱', '📦'] },
  { title: '🔧 Configuration and Tooling', rules: ['🔧', '🔊', '🔇', '📱'] },
  { title: '🔥 Removals', rules: ['🔥'] },
]

/**
 * `releaseRules` for `semantic-release-gitmoji`, mapping the gitmoji table in
 * `AGENTS.md` onto release types. Keep the two in sync.
 */
const RELEASE_RULES = {
  major: ['💥'],
  minor: ['✨', '🗑️'],
  patch: [
    '🐛', '✏️', '🔒', '🔐', '🚑', '⚡', '♻️', '💄', '➕', '➖', '⬆️', '⬇️',
    '📌', '🔧', '👷‍♂️', '💚', '🍱', '📦', '🥅', '🔊', '🔇', '📱', '🔥',
  ],
}

/**
 * Changelog template replacing the plugin's default, which renders only the
 * five commit types `semantic-release-gitmoji` declares out of the box and
 * drops every other emoji silently. Here each section is rendered when it has
 * commits and omitted otherwise, so a release containing only 🔧 commits still
 * gets a body instead of a bare heading.
 */
const RELEASE_NOTES_TEMPLATE = `{{#if compareUrl}}
# [v{{nextRelease.version}}]({{compareUrl}}) ({{datetime "UTC:yyyy-mm-dd"}})
{{else}}
# v{{nextRelease.version}} ({{datetime "UTC:yyyy-mm-dd"}})
{{/if}}
{{#each (sections commits)}}
{{#if commits.length}}

## {{title}}

{{#each commits}}
- {{> commitTemplate}}
{{/each}}
{{/if}}
{{/each}}`

/**
 * Flatten the per-emoji commit buckets into ordered sections.
 *
 * @param {object} commits Map of emoji to commits, as given to the template.
 * @returns {object[]} One entry per section, including empty ones.
 */
function sections (commits = {}) {
  return SECTIONS.map(({ title, rules }) => ({
    title,
    commits: rules.flatMap((rule) => commits[rule] ?? []),
  }))
}

/**
 * The manifests a release bumps, in the shape both plugins below accept.
 *
 * `plugin.json` carries the version at the top level; `marketplace.json`
 * carries it in the entry pointing at this directory. Declared once so the
 * plugin that writes them and the plugin that commits them cannot disagree
 * about which files a release touches.
 */
const MANIFESTS = [
  { path: 'plugin.json', pointer: '/version' },
  { path: 'marketplace.json', pointer: '/plugins/0/version' },
]

module.exports = {
  // `main` holds released code only; `rc` is the long-lived integration branch.
  // The `feat/**`, `bug/**` and `chore/**` entries exist so that a manual
  // dispatch publishes a preview from any of those branches. The `prerelease`
  // strings are templates: semantic-release renders them per matched branch,
  // which is what keeps each preview on its own identifier.
  branches: [
    'main',
    { name: 'rc', prerelease: 'rc' },
    { name: 'feat/**', channel: 'preview', prerelease: 'preview-${name.replace(/^feat\\//, "").replace(/\\//g, "-")}' },
    { name: 'bug/**', channel: 'preview', prerelease: 'preview-${name.replace(/^bug\\//, "").replace(/\\//g, "-")}' },
    { name: 'chore/**', channel: 'preview', prerelease: 'preview-${name.replace(/^chore\\//, "").replace(/\\//g, "-")}' },
  ],

  // The version lives in the tag and in the manifests. The tag is created by
  // semantic-release; the manifests are written and committed by the two
  // `prepare` steps below.
  tagFormat: 'v${version}',

  plugins: [
    ['semantic-release-gitmoji', {
      releaseRules: RELEASE_RULES,
      releaseNotes: {
        template: RELEASE_NOTES_TEMPLATE,
        helpers: { sections },
      },
    }],

    // Step 1 of the release commit: write the resolved version into the
    // manifests. A local plugin, loaded by path, taking the same `files` option
    // as the commit plugin below — so both steps read as one description of
    // what a release commit contains.
    //
    // `prepare` steps run in the order they appear here, which is why this one
    // comes first: the commit plugin reads these files from disk.
    ['./tools/release-manifests', {
      files: MANIFESTS,
    }],

    // Step 2 of the release commit: commit those files through the GitHub API,
    // which is what makes GitHub sign the commit. Passing an author or committer
    // would silently drop the signature, which is why the workflow sets no
    // `GIT_AUTHOR_*`/`GIT_COMMITTER_*`: the plugin then receives only
    // semantic-release's own default bot identity and discards it.
    //
    // The plugin also moves local `HEAD` onto the new commit — without that
    // semantic-release would tag the pre-bump commit, since it creates the tag
    // from `nextRelease.gitHead` after every `prepare` has finished.
    //
    // `[skip ci]` is not decoration: the plugin pushes this commit to the branch
    // through the API, and that push would otherwise start a second release run.
    ['@jno21/semantic-release-github-commit', {
      files: MANIFESTS.map(({ path }) => path),
      commitMessage: '🔖 Update the plugin manifests to ${nextRelease.version} [skip ci]',
    }],

    // Publishes the GitHub release and pushes the tags. The notes generated
    // above become the release body, which is why no `CHANGELOG.md` is written:
    // without `@semantic-release/git` the file would be discarded with the
    // runner, and the release body already carries the same content.
    '@semantic-release/github',

    // ---------------------------------------------------------------------
    // Adding a build tool (language templates only)
    // ---------------------------------------------------------------------
    //
    // A template whose build tool owns the version adds a `prepare` step next to
    // the manifest one above, in this position — before the commit plugin, so the
    // bump lands in the same commit. That is the case `@semantic-release/exec`
    // exists for: the tool knows how to bump itself.
    //
    //   ['@semantic-release/exec', {
    //     prepareCmd: './mvnw versions:set -DnewVersion=${nextRelease.version}',
    //   }],
    //
    // `${nextRelease.version}` is already fully resolved, prerelease suffix
    // included, so `1.2.0-rc.1` needs no special handling. Add the rewritten
    // file to `MANIFESTS` as well, and skip the `prepareCmd` when
    // `${options.dryRun}` is `true`.
    //
    // Do not add `@semantic-release/git`: it makes a local commit, whose
    // committer is the runner and whose signature GitHub cannot vouch for — the
    // opposite of what the release commit is for.
  ],
}
