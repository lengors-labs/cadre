import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { Agent } from "@opencode/plugin"
import { applyAgent, loadAgents, loadSkill, loadSkills, parseAgent, registerAgents, validateCadreAgent } from "../src/definitions.js"

const worker = `---
description: Reviews code
mode: subagent
model: example/model#high
steps: 8
request:
  headers: { X-Test: value }
  body: { temperature: 0.2 }
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: read, resource: "*", effect: allow }
  - { action: read, resource: "*.env", effect: deny }
---
Review changes.\n`

test("reads metadata, request, ordered permissions and explicit worker mode", () => {
  const definition = parseAgent(worker, "/agents/reviewer.md")
  validateCadreAgent(definition, "reviewer.md")
  assert.equal(definition.mode, "subagent")
  assert.equal(definition.system, "Review changes.")
  const agent: { -readonly [K in keyof Agent.Info]: Agent.Info[K] } = Agent.Info.default(Agent.ID.make("reviewer"))
  applyAgent(agent, definition)
  assert.equal(agent.mode, "subagent")
  assert.deepEqual(agent.model, { providerID: "example", id: "model", variant: "high" })
  assert.deepEqual(agent.request.headers, { "X-Test": "value" })
  assert.deepEqual(agent.request.body, { temperature: 0.2 })
  assert.deepEqual(agent.permissions, definition.permissions)
  agent.permissions[0].effect = "allow"
  assert.equal(definition.permissions[0].effect, "deny")
})

test("accepts all documented modes without assigning meaning to the ID", () => {
  for (const mode of ["primary", "subagent", "all"]) {
    assert.equal(parseAgent(worker.replace("mode: subagent", `mode: ${mode}`), "worker.md").mode, mode)
  }
  assert.equal(parseAgent("Prompt", "anything.md").mode, "primary")
  assert.throws(() => validateCadreAgent(parseAgent(worker.replace("mode: subagent\n", ""), "worker.md"), "worker.md"), /explicit mode/)
  assert.equal(parseAgent(worker.replace("mode: subagent", "disabled: true"), "worker.md").disabled, true)
})

test("separates supported OpenCode parsing from cadre deny-first validation", () => {
  const parsed = parseAgent(worker.replace('  - { action: "*", resource: "*", effect: deny }\n', ""), "reviewer.md")
  assert.throws(() => validateCadreAgent(parsed, "reviewer.md"), /deny-all/)
  assert.throws(() => parseAgent(worker.replace("permissions:", "tools: [shell]\npermissions:"), "reviewer.md"), /unsupported/)
  assert.throws(() => parseAgent(worker.replace("model: example/model#high", "model: model"), "reviewer.md"), /model/)
  assert.throws(() => parseAgent(worker.replace("effect: allow", "effect: maybe"), "reviewer.md"), /invalid permission/)
})

test("discovers nested agents and fails if the asset directory is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadre-agents-"))
  await assert.rejects(loadAgents(join(root, "absent")), { code: "ENOENT" })
  await mkdir(join(root, "agents", "team"), { recursive: true })
  await writeFile(join(root, "agents", "team", "reviewer.md"), worker)
  await writeFile(join(root, "agents", "notes.txt"), "ignored")
  assert.deepEqual((await loadAgents(join(root, "agents"))).map((agent) => agent.id), ["team/reviewer"])
})

test("refuses agent collisions before changing the registry and skips disabled definitions", () => {
  const definitions = [parseAgent(worker, "reviewer.md"), parseAgent(worker, "build.md")]
  const updates: string[] = []
  const editor = { get: (id: string) => id === "build" ? {} : undefined, update: (id: string) => { updates.push(id) } }
  assert.throws(() => registerAgents(editor, definitions), /agent ID already exists: build/)
  assert.deepEqual(updates, [])
  definitions[1].disabled = true
  registerAgents(editor, definitions)
  assert.deepEqual(updates, ["reviewer"])
})

test("discovers multiple skills and applies canonical autoinvoke precedence", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadre-skills-"))
  for (const [id, frontmatter] of [
    ["first", 'name: First\ndisable-model-invocation: true\nmetadata:\n  opencode/autoinvoke: true'],
    ["second", 'description: Second\ndisable-model-invocation: false\nmetadata:\n  opencode/autoinvoke: false'],
    ["third", 'disable-model-invocation: true'],
  ]) {
    await mkdir(join(root, id))
    await writeFile(join(root, id, "SKILL.md"), `---\n${frontmatter}\n---\nInstructions`)
  }
  const skills = await loadSkills(root)
  assert.deepEqual(skills.map((s) => [s.id, s.name, s.autoinvoke]), [
    ["first", "First", true], ["second", "second", false], ["third", "third", false],
  ])
  assert.equal(skills[0].path, join(root, "first", "SKILL.md"))
  assert.equal(skills[0].content, "Instructions")
  await assert.rejects(loadSkills(join(root, "absent")), { code: "ENOENT" })
})

test("loads the packaged workflow and its supporting script", async () => {
  const path = join(process.cwd(), "skills", "issue-workflow", "SKILL.md")
  const skill = await loadSkill(path)
  assert.equal(skill.id, "issue-workflow")
  assert.ok(skill.description?.includes("End-to-end"))
  assert.ok(skill.content.includes("# Issue-to-PR workflow"))
  assert.ok((await readFile(join(process.cwd(), "skills", "issue-workflow", "scripts", "normalize-index-modes.py"), "utf8")).length > 0)
})
