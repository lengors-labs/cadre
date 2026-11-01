'use strict'

/**
 * Tests for `tools/release-manifests.js` and the wiring in `.releaserc.js`.
 *
 * Run with `node --test tools/*.test.js`. The plugin is called the way
 * semantic-release calls it — with the config object from `.releaserc.js` and a
 * context — so the tests exercise the shipped code path rather than a copy.
 */

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { afterEach, describe, it } = require('node:test')

const { parsePointer, prepare, resolveFiles } = require('./release-manifests.js')
const config = require('../.releaserc.js')

const repositoryRoot = join(__dirname, '..')

const PLUGIN_JSON = `{
  "name": "cadre",
  "version": "0.0.0",
  "keywords": [
    "agents"
  ]
}
`

// One line on purpose: a manifest formatted unlike `JSON.stringify(…, null, 2)`
// is the case the plugin cannot keep diff-minimal.
const COMPACT_JSON = `{
  "name": "cadre",
  "version": "0.0.0",
  "keywords": ["agents"]
}
`

const MARKETPLACE_JSON = `{
  "name": "lengors-labs",
  "plugins": [
    {
      "name": "cadre",
      "source": "./",
      "version": "0.0.0"
    }
  ]
}
`

const MANIFESTS = [
  { path: 'plugin.json', pointer: '/version' },
  { path: 'marketplace.json', pointer: '/plugins/0/version' },
]

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    execFileSync('rm', ['-rf', directory])
  }
})

/**
 * Create a working directory holding copies of the manifests.
 *
 * @param {{ plugin?: string, marketplace?: string }} [overrides] Contents to use.
 * @returns {string} The directory.
 */
function createWorkspace (overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cadre-release-manifests-'))
  temporaryDirectories.push(directory)

  writeFileSync(join(directory, 'plugin.json'), overrides.plugin ?? PLUGIN_JSON)
  writeFileSync(join(directory, 'marketplace.json'), overrides.marketplace ?? MARKETPLACE_JSON)

  return directory
}

/**
 * Call the plugin the way semantic-release does.
 *
 * @param {string} cwd Working directory.
 * @param {{ version?: string, dryRun?: boolean, files?: unknown }} [options] Release details.
 * @returns {{ lines: string[], error?: Error }} Run result.
 */
function run (cwd, { version = '1.0.0-rc.1', dryRun = false, files = MANIFESTS } = {}) {
  const lines = []
  const logger = { log: (message) => lines.push(message) }

  try {
    prepare({ files }, { cwd, logger, nextRelease: { version, gitTag: `v${version}` }, options: { dryRun } })
  } catch (error) {
    return { lines, error }
  }

  return { lines }
}

const read = (directory, file) => readFileSync(join(directory, file), 'utf8')
const versionOf = (directory, file) => JSON.parse(read(directory, file))
const pluginVersion = (directory) => versionOf(directory, 'plugin.json').version
const marketplaceVersion = (directory) => versionOf(directory, 'marketplace.json').plugins[0].version

describe('parsePointer', () => {
  it('splits segments and unescapes ~1 and ~0', () => {
    assert.deepEqual(parsePointer('/version'), ['version'])
    assert.deepEqual(parsePointer('/plugins/0/version'), ['plugins', '0', 'version'])
    assert.deepEqual(parsePointer('/a~1b/c~0d'), ['a/b', 'c~d'])
  })

  it('requires a leading slash', () => {
    assert.throws(() => parsePointer('version'), { code: 'EINVALIDPOINTER' })
  })
})

describe('resolveFiles', () => {
  it('accepts a pointer per file', () => {
    assert.deepEqual(resolveFiles(MANIFESTS), [
      { path: 'plugin.json', keys: ['version'] },
      { path: 'marketplace.json', keys: ['plugins', '0', 'version'] },
    ])
  })

  it('defaults a bare string to /version', () => {
    assert.deepEqual(resolveFiles(['plugin.json']), [{ path: 'plugin.json', keys: ['version'] }])
  })

  it('rejects a missing or empty list', () => {
    assert.throws(() => resolveFiles(undefined), { code: 'EINVALIDCONFIG' })
    assert.throws(() => resolveFiles([]), { code: 'EINVALIDCONFIG' })
  })

  it('rejects an entry with no path', () => {
    assert.throws(() => resolveFiles([{ pointer: '/version' }]), { code: 'EINVALIDCONFIG' })
    assert.throws(() => resolveFiles([{ path: '', pointer: '/version' }]), { code: 'EINVALIDCONFIG' })
  })

  it('rejects a pointer addressing the whole document', () => {
    assert.throws(() => resolveFiles([{ path: 'plugin.json', pointer: '/' }]), { code: 'EINVALIDPOINTER' })
    assert.throws(() => resolveFiles([{ path: 'plugin.json', pointer: '/a//b' }]), { code: 'EINVALIDPOINTER' })
  })
})

describe('prepare', () => {
  it('writes the version into every configured file', () => {
    const directory = createWorkspace()
    const { error } = run(directory)

    assert.equal(error, undefined)
    assert.equal(pluginVersion(directory), '1.0.0-rc.1')
    assert.equal(marketplaceVersion(directory), '1.0.0-rc.1')
  })

  it('honours the files option rather than a fixed list', () => {
    const directory = createWorkspace()
    run(directory, { files: [{ path: 'plugin.json', pointer: '/version' }] })

    assert.equal(pluginVersion(directory), '1.0.0-rc.1')
    assert.equal(marketplaceVersion(directory), '0.0.0', 'marketplace.json was not configured')
  })

  it('honours an arbitrary pointer', () => {
    const directory = createWorkspace({
      plugin: JSON.stringify({ name: 'cadre', meta: { release: { version: '0.0.0' } } }, null, 2) + '\n',
    })

    run(directory, { files: [{ path: 'plugin.json', pointer: '/meta/release/version' }] })

    assert.equal(JSON.parse(read(directory, 'plugin.json')).meta.release.version, '1.0.0-rc.1')
  })

  it('changes one line per file when the manifest is already JSON.stringify-shaped', () => {
    const directory = createWorkspace()
    const before = read(directory, 'plugin.json')

    run(directory)

    const changed = read(directory, 'plugin.json')
      .split('\n')
      .filter((line, index) => line !== before.split('\n')[index])

    assert.equal(changed.length, 1)
    assert.match(changed[0], /"version": "1\.0\.0-rc\.1"/)
  })

  it('rewrites a hand-formatted manifest whole, which is the documented cost', () => {
    const directory = createWorkspace({ plugin: COMPACT_JSON })

    run(directory)

    // Not a bug: re-serializing is what keeps key order and indentation stable,
    // and it costs one reformatting commit for a file that was not already in
    // `JSON.stringify(…, null, 2)` form.
    assert.notEqual(read(directory, 'plugin.json'), COMPACT_JSON.replace('0.0.0', '1.0.0-rc.1'))
    assert.equal(pluginVersion(directory), '1.0.0-rc.1')
  })

  it('is idempotent and says so', () => {
    const directory = createWorkspace()
    run(directory)
    const after = read(directory, 'plugin.json')

    const { lines, error } = run(directory)

    assert.equal(error, undefined)
    assert.equal(read(directory, 'plugin.json'), after)
    assert.match(lines.join('\n'), /already at 1\.0\.0-rc\.1/)
  })

  it('writes nothing during a dry run', () => {
    const directory = createWorkspace()
    const { lines } = run(directory, { dryRun: true })

    assert.match(lines.join('\n'), /\[dry run\] plugin\.json: would write 1\.0\.0-rc\.1/)
    assert.equal(pluginVersion(directory), '0.0.0')
    assert.equal(marketplaceVersion(directory), '0.0.0')
  })

  it('writes nothing at all when one file is malformed', () => {
    const directory = createWorkspace({ marketplace: '{' })

    const { error } = run(directory)

    assert.ok(error)
    // The first file is validated before anything is written, so a broken
    // manifest leaves the checkout exactly as it was.
    assert.equal(pluginVersion(directory), '0.0.0')
  })

  it('fails when a configured pointer does not exist', () => {
    const directory = createWorkspace()

    const { error } = run(directory, { files: [{ path: 'plugin.json', pointer: '/nope' }] })

    assert.match(error.message, /plugin\.json has no value at "\/nope"/)
  })

  it('fails when a file is missing', () => {
    const directory = createWorkspace()
    execFileSync('rm', [join(directory, 'marketplace.json')])

    assert.match(run(directory).error.message, /marketplace\.json: ENOENT/)
  })

  it('reports errors as semantic-release errors, not stack traces', () => {
    const directory = createWorkspace({ marketplace: '{' })
    const { error } = run(directory)

    assert.equal(error.semanticRelease, true)
    assert.equal(error.code, 'EMANIFEST')
  })

  it('bumps the real manifests of this repository', () => {
    const directory = createWorkspace({
      plugin: readFileSync(join(repositoryRoot, 'plugin.json'), 'utf8'),
      marketplace: readFileSync(join(repositoryRoot, 'marketplace.json'), 'utf8'),
    })

    assert.equal(run(directory, { version: '9.9.9' }).error, undefined)
    assert.equal(pluginVersion(directory), '9.9.9')
    assert.equal(marketplaceVersion(directory), '9.9.9')
  })
})

describe('release configuration', () => {
  const inlineIndex = config.plugins.findIndex(
    (plugin) => Array.isArray(plugin) && plugin[0] === './tools/release-manifests',
  )

  it('loads the manifest plugin by local path, before the commit plugin', () => {
    const commitIndex = config.plugins.findIndex(
      (plugin) => Array.isArray(plugin) && plugin[0] === '@jno21/semantic-release-github-commit',
    )

    assert.notEqual(inlineIndex, -1, 'the manifest plugin is not in the pipeline')
    assert.ok(inlineIndex < commitIndex, 'the bump must run before the files are read and committed')
  })

  it('describes the release commit once, in one list', () => {
    const commit = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === '@jno21/semantic-release-github-commit',
    )
    const bumped = config.plugins[inlineIndex][1].files.map(({ path }) => path)

    assert.deepEqual(bumped.sort(), commit[1].files.slice().sort())
  })

  it('runs the configured files through the plugin without error', () => {
    const directory = createWorkspace()
    const pluginConfig = config.plugins[inlineIndex][1]

    assert.equal(run(directory, { files: pluginConfig.files }).error, undefined)
    assert.equal(pluginVersion(directory), '1.0.0-rc.1')
  })

  it('does not fall back to @semantic-release/exec for the manifests', () => {
    const names = config.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin))

    assert.equal(names.includes('@semantic-release/exec'), false)
  })
})
