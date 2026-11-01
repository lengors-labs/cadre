'use strict'

/**
 * semantic-release plugin that writes the release version into JSON manifests.
 *
 * Loaded from `.releaserc.js` by path, and configured the way
 * `@jno21/semantic-release-github-commit` is — with a `files` option — so the
 * two steps that make up the release commit are described the same way and read
 * as one unit:
 *
 *     ['./tools/release-manifests', {
 *       files: [
 *         { path: 'plugin.json', pointer: '/version' },
 *         { path: 'marketplace.json', pointer: '/plugins/0/version' },
 *       ],
 *     }],
 *
 * It runs at `prepare`, immediately before that commit plugin, which then
 * commits the files this one rewrote.
 *
 * ## Why a plugin and not a command
 *
 * `@semantic-release/exec` runs a shell command, which for this job would need a
 * script plus `> file.tmp && mv` to avoid truncating the input, a shell `if` to
 * skip the write during a dry run, and a `&&` chain to stop at the first
 * failure. As a plugin each of those is one line — and the version arrives as a
 * `nextRelease` value rather than being spliced into shell text.
 *
 * `exec` is still the right tool when a build tool already owns the version
 * (`./gradlew setVersion`); it is the wrong tool for editing a JSON file.
 *
 * ## Ordering guarantee
 *
 * Every file is read and validated, and every rewrite computed, before anything
 * is written. A malformed or incomplete manifest therefore aborts the release
 * with the checkout exactly as it was, instead of leaving a half-bumped tree for
 * the commit plugin to pick up.
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

/** Default `prepare` step: the version goes at `/version`. */
const DEFAULT_POINTER = '/version'

/**
 * A failure that semantic-release reports as an explained error rather than as a
 * stack trace. `code` and `semanticRelease` are the two properties its CLI reads.
 */
class ReleaseManifestsError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'ReleaseManifestsError'
    this.code = code
    this.semanticRelease = true
  }
}

/**
 * Split a JSON pointer into its unescaped segments.
 *
 * @param {string} pointer Pointer such as `/version` or `/plugins/0/version`.
 * @returns {string[]} The segments.
 */
function parsePointer (pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new ReleaseManifestsError(
      'EINVALIDPOINTER',
      `Invalid JSON pointer ${JSON.stringify(pointer)}: it must be a string starting with "/"`,
    )
  }

  const keys = pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))

  // `/` splits to `['']`: a pointer that addresses nothing, or one with an empty
  // segment, is always a mistake and never a version field.
  if (keys.some((key) => key === '')) {
    throw new ReleaseManifestsError(
      'EINVALIDPOINTER',
      `Invalid JSON pointer ${JSON.stringify(pointer)}: it must address a property`,
    )
  }

  return keys
}

/**
 * Normalize the `files` option into `{ path, keys }` entries.
 *
 * A bare string is accepted as shorthand for a `/version` pointer, matching how
 * a repository with a single obvious version field would want to write it.
 *
 * @param {unknown} files Plugin option.
 * @returns {Array<{ path: string, keys: string[] }>} One entry per file.
 */
function resolveFiles (files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new ReleaseManifestsError(
      'EINVALIDCONFIG',
      'The "files" option must be a non-empty array of paths or { path, pointer } objects',
    )
  }

  return files.map((entry) => {
    const path = typeof entry === 'string' ? entry : entry?.path
    const pointer = typeof entry === 'string' ? DEFAULT_POINTER : entry?.pointer ?? DEFAULT_POINTER

    if (typeof path !== 'string' || path.length === 0) {
      throw new ReleaseManifestsError('EINVALIDCONFIG', `Invalid "files" entry: ${JSON.stringify(entry)}`)
    }

    const keys = parsePointer(pointer)

    return { path, keys }
  })
}

/**
 * Read the value at a pointer.
 *
 * @param {unknown} document Parsed JSON document.
 * @param {string[]} keys Pointer segments.
 * @returns {{ found: boolean, value?: unknown }} Lookup result.
 */
function readAt (document, keys) {
  let current = document

  for (const key of keys) {
    if (current === null || typeof current !== 'object') return { found: false }
    if (!Object.prototype.hasOwnProperty.call(current, key)) return { found: false }
    current = current[key]
  }

  return { found: true, value: current }
}

/**
 * Write a value at a pointer. The path must already exist: this plugin bumps a
 * version, it never invents one.
 *
 * @param {unknown} document Parsed JSON document, mutated in place.
 * @param {string[]} keys Pointer segments.
 * @param {unknown} value Value to write.
 * @returns {void}
 */
function writeAt (document, keys, value) {
  let current = document

  for (const key of keys.slice(0, -1)) {
    current = current[key]
  }

  current[keys.at(-1)] = value
}

/**
 * Produce the bumped content of one manifest.
 *
 * Re-serializing with `JSON.stringify(…, null, 2)` reproduces the existing
 * formatting exactly — the manifests are stored that way — so the release commit
 * still shows a one-line diff per file. A file formatted differently by hand is
 * rewritten whole once; that is the only case where this is not diff-minimal.
 *
 * @param {{ path: string, keys: string[] }} file File to bump.
 * @param {string} version Version to write.
 * @param {string} cwd Repository root.
 * @returns {{ path: string, previous: unknown, text: string, changed: boolean }} Result.
 */
function bump ({ path, keys }, version, cwd) {
  let document

  try {
    document = JSON.parse(readFileSync(join(cwd, path), 'utf8'))
  } catch (error) {
    throw new ReleaseManifestsError('EMANIFEST', `${path}: ${error.message}`)
  }

  const { found, value: previous } = readAt(document, keys)

  if (!found) {
    throw new ReleaseManifestsError(
      'EMANIFEST',
      `${path} has no value at "${['', ...keys].join('/')}"`,
    )
  }

  if (previous === version) return { path, previous, text: '', changed: false }

  writeAt(document, keys, version)

  return { path, previous, text: `${JSON.stringify(document, null, 2)}\n`, changed: true }
}

/**
 * Write the release version into every configured manifest.
 *
 * @param {object} pluginConfig Plugin options.
 * @param {object} context semantic-release context.
 * @returns {void}
 */
function prepare (pluginConfig, context) {
  const { cwd = process.cwd(), logger, nextRelease, options = {} } = context

  if (!nextRelease?.version) {
    throw new ReleaseManifestsError('ENOVERSION', 'No next release version in the semantic-release context')
  }

  const files = resolveFiles(pluginConfig.files)

  // Compute every rewrite first: a malformed file must abort before anything is
  // written, so the checkout is never left half-bumped.
  const updates = files.map((file) => bump(file, nextRelease.version, cwd))
  const changed = updates.filter((update) => update.changed)

  if (changed.length === 0) {
    logger.log(`Manifests already at ${nextRelease.version}: nothing to commit`)
    return
  }

  if (options.dryRun) {
    for (const { path } of changed) logger.log(`[dry run] ${path}: would write ${nextRelease.version}`)
    return
  }

  for (const { path, previous, text } of changed) {
    writeFileSync(join(cwd, path), text)
    logger.log(`${path}: ${JSON.stringify(previous)} -> ${JSON.stringify(nextRelease.version)}`)
  }
}

module.exports = { prepare, parsePointer, readAt, resolveFiles }
