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

  // The version lives in the tag and never in a file: this repository has no
  // build tool. Language templates that have one add a `prepare` step, below.
  tagFormat: 'v${version}',

  plugins: [
    ['semantic-release-gitmoji', {
      releaseRules: RELEASE_RULES,
      releaseNotes: {
        template: RELEASE_NOTES_TEMPLATE,
        helpers: { sections },
      },
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
    // This generic layer stops at the tag. A template that has a build tool
    // adds two plugins *after* the ones above, in this order:
    //
    //   ['@semantic-release/exec', {
    //     prepareCmd: './mvnw versions:set -DnewVersion=${nextRelease.version}',
    //   }],
    //   ['@semantic-release/git', {
    //     assets: ['pom.xml'],
    //     message: '🔖 Update `pom.xml` to `${nextRelease.version}` [skip release]',
    //   }],
    //
    // `${nextRelease.version}` is already fully resolved, prerelease suffix
    // included, so `1.2.0-rc.1` needs no special handling.
    //
    // `@semantic-release/git` must stay last: it commits whatever the preceding
    // `prepare` steps wrote, so its asset list is the final one.
  ],
}
