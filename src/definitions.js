import { readdir, readFile } from "node:fs/promises"
import { basename, dirname, join, relative, sep } from "node:path"
import { Model, Skill } from "@opencode/plugin"
import { parseDocument } from "yaml"

/** @typedef {{ action: string, resource: string, effect: "allow" | "ask" | "deny" }} Permission */
/** @typedef {{ -readonly [K in keyof import('@opencode/plugin').Agent.Info]: import('@opencode/plugin').Agent.Info[K] }} AgentDraft */
/**
 * @typedef {object} AgentDefinition
 * @property {string} id
 * @property {string} [description]
 * @property {string} [system]
 * @property {"primary" | "subagent" | "all"} mode
 * @property {boolean} explicitMode
 * @property {Permission[]} permissions
 * @property {boolean} disabled
 * @property {import('@opencode/plugin').Agent.Info['model']} [model]
 * @property {{ headers?: Record<string, string>, body?: Record<string, unknown> }} [request]
 * @property {number} [steps]
 * @property {boolean} [hidden]
 * @property {string} [color]
 */

/** @param {string} source @param {string} path @returns {{ attributes: Record<string, unknown>, body: string }} */
function markdown(source, path) {
  if (!/^---\s*\r?\n/.test(source)) return { attributes: {}, body: source.trim() }
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/)
  if (!match) throw new Error(`${path}: unterminated YAML frontmatter`)
  const document = parseDocument(match[1], { uniqueKeys: true })
  if (document.errors.length) throw new Error(`${path}: invalid YAML: ${document.errors[0].message}`)
  /** @type {unknown} */
  const attributes = document.toJS()
  if (attributes !== null && (typeof attributes !== "object" || Array.isArray(attributes))) {
    throw new Error(`${path}: frontmatter must be a mapping`)
  }
  return { attributes: /** @type {Record<string, unknown>} */ (attributes ?? {}), body: match[2].trim() }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** @param {unknown} value @param {string} path @returns {import('@opencode/plugin').Agent.Info['model']} */
function parseModel(value, path) {
  let ref
  if (typeof value === "string") ref = value
  else if (record(value) && typeof value.providerID === "string" && typeof value.model === "string" &&
    (value.variant === undefined || typeof value.variant === "string") &&
    Object.keys(value).every((key) => ["providerID", "model", "variant"].includes(key))) {
    ref = `${value.providerID}/${value.model}${value.variant === undefined ? "" : `#${value.variant}`}`
  } else throw new Error(`${path}: invalid model`)
  if (!/^[^/\s]+\/[^/#\s]+(?:#[^#\s]+)?$/.test(ref)) throw new Error(`${path}: invalid model`)
  return Model.Ref.parse(ref)
}

/** @param {string} source @param {string} path @param {string} [id] @returns {AgentDefinition} */
export function parseAgent(source, path, id = basename(path, ".md")) {
  const { attributes: a, body } = markdown(source, path)
  const supported = new Set(["description", "mode", "model", "request", "steps", "hidden", "color", "disabled", "permissions"])
  for (const key of Object.keys(a)) {
    if (!supported.has(key)) throw new Error(`${path}: unsupported agent field ${key}`)
  }
  if (a.description !== undefined && typeof a.description !== "string") throw new Error(`${path}: invalid description`)
  const mode = a.mode ?? "primary"
  if (mode !== "subagent" && mode !== "primary" && mode !== "all") throw new Error(`${path}: invalid mode`)
  if (a.steps !== undefined && (typeof a.steps !== "number" || !Number.isSafeInteger(a.steps) || a.steps <= 0)) throw new Error(`${path}: invalid steps`)
  if (a.hidden !== undefined && typeof a.hidden !== "boolean") throw new Error(`${path}: invalid hidden`)
  if (a.disabled !== undefined && typeof a.disabled !== "boolean") throw new Error(`${path}: invalid disabled`)
  if (a.color !== undefined && (typeof a.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(a.color))) throw new Error(`${path}: invalid color`)
  /** @type {AgentDefinition['request']} */
  let request
  if (a.request !== undefined) {
    if (!record(a.request) || Object.keys(a.request).some((key) => !["headers", "body"].includes(key)) ||
      (a.request.headers !== undefined && (!record(a.request.headers) || Object.values(a.request.headers).some((v) => typeof v !== "string"))) ||
      (a.request.body !== undefined && !record(a.request.body))) throw new Error(`${path}: invalid request`)
    request = /** @type {AgentDefinition['request']} */ (a.request)
  }
  if (a.permissions !== undefined && !Array.isArray(a.permissions)) throw new Error(`${path}: invalid permissions`)
  /** @type {Permission[]} */
  const permissions = (a.permissions ?? []).map((/** @type {unknown} */ rule) => {
    if (!record(rule) || Object.keys(rule).some((key) => !["action", "resource", "effect"].includes(key)) ||
      typeof rule.action !== "string" || !rule.action || typeof rule.resource !== "string" || !rule.resource ||
      (rule.effect !== "allow" && rule.effect !== "ask" && rule.effect !== "deny")) throw new Error(`${path}: invalid permission`)
    return /** @type {Permission} */ ({ action: rule.action, resource: rule.resource, effect: rule.effect })
  })
  return {
    id, description: a.description, system: body || undefined, mode, explicitMode: a.mode !== undefined, permissions,
    disabled: a.disabled === true, model: a.model === undefined ? undefined : parseModel(a.model, path), request,
    steps: a.steps, hidden: a.hidden, color: a.color,
  }
}

// Cadre's shipped agents must deny by default, regardless of OpenCode's broader defaults.
/** @param {AgentDefinition} agent @param {string} path */
export function validateCadreAgent(agent, path) {
  if (agent.disabled) return
  if (!agent.explicitMode) throw new Error(`${path}: cadre agents require an explicit mode`)
  const first = agent.permissions[0]
  if (!first || first.action !== "*" || first.resource !== "*" || first.effect !== "deny") {
    throw new Error(`${path}: cadre permissions must begin with deny-all`)
  }
}

/** @param {string} directory @returns {Promise<AgentDefinition[]>} */
export async function loadAgents(directory) {
  /** @type {AgentDefinition[]} */
  const agents = []
  /** @param {string} dir @returns {Promise<void>} */
  async function visit(dir) {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const id = relative(directory, path).slice(0, -3).split(sep).join("/")
        const agent = parseAgent(await readFile(path, "utf8"), path, id)
        validateCadreAgent(agent, path)
        agents.push(agent)
      }
    }
  }
  await visit(directory)
  return agents
}

/** @param {string} path @returns {Promise<import('@opencode/plugin').Skill.Info>} */
export async function loadSkill(path) {
  const { attributes: a, body } = markdown(await readFile(path, "utf8"), path)
  const id = basename(dirname(path))
  if (a.name !== undefined && typeof a.name !== "string") throw new Error(`${path}: invalid skill name`)
  if (a.description !== undefined && typeof a.description !== "string") throw new Error(`${path}: invalid skill description`)
  if (a.metadata !== undefined && !record(a.metadata)) throw new Error(`${path}: invalid metadata`)
  const canonical = record(a.metadata) ? a.metadata["opencode/autoinvoke"] : undefined
  if (canonical !== undefined && typeof canonical !== "boolean") throw new Error(`${path}: invalid autoinvoke`)
  if (a["disable-model-invocation"] !== undefined && typeof a["disable-model-invocation"] !== "boolean") {
    throw new Error(`${path}: invalid disable-model-invocation`)
  }
  return {
    id: Skill.ID.make(id), name: Skill.Name.make(a.name ?? id),
    description: a.description?.trim(), content: body,
    autoinvoke: canonical ?? (a["disable-model-invocation"] !== true),
    path: Skill.Info.fields.path.make(path),
  }
}

/** @param {string} directory @returns {Promise<import('@opencode/plugin').Skill.Info[]>} */
export async function loadSkills(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
  /** @type {import('@opencode/plugin').Skill.Info[]} */
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue
    const path = join(directory, entry.name, "SKILL.md")
    skills.push(await loadSkill(path))
  }
  return skills
}

/** @param {{ get(id: string): unknown, update(id: string, apply: (agent: AgentDraft) => void): void }} editor @param {AgentDefinition[]} definitions */
export function registerAgents(editor, definitions) {
  const enabled = definitions.filter((definition) => !definition.disabled)
  for (const definition of enabled) {
    if (editor.get(definition.id)) throw new Error(`cadre: agent ID already exists: ${definition.id}`)
  }
  for (const definition of enabled) {
    editor.update(definition.id, (agent) => applyAgent(agent, definition))
  }
}

/** @param {AgentDraft} agent @param {AgentDefinition} definition */
export function applyAgent(agent, definition) {
  agent.description = definition.description
  agent.system = definition.system
  agent.mode = definition.mode
  agent.permissions = definition.permissions.map((rule) => ({ ...rule }))
  if (definition.model !== undefined) agent.model = definition.model
  if (definition.request !== undefined) {
    agent.request = { ...agent.request, headers: { ...definition.request.headers }, body: { ...definition.request.body } }
  }
  if (definition.steps !== undefined) agent.steps = definition.steps
  if (definition.hidden !== undefined) agent.hidden = definition.hidden
  if (definition.color !== undefined) agent.color = definition.color
}
