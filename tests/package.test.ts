import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Git package does not declare scripts that trigger Git preparation", async () => {
  const { readFile } = await import("node:fs/promises");
  const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  for (const script of [
    "prepare",
    "preinstall",
    "install",
    "postinstall",
    "prepack",
    "build",
  ]) {
    assert.ok(
      !(script in (manifest.scripts ?? {})),
      `${script} triggers Git preparation`,
    );
  }
});

test(
  "installed package loads with native Node and registers packaged assets",
  { timeout: 120_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cadre-package-"));
    const consumer = join(root, "consumer");
    await mkdir(consumer);
    const output = execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
      { encoding: "utf8" },
    );
    const [pack] = JSON.parse(output) as [
      { filename: string; files: { path: string }[] },
    ];
    for (const path of [
      "src/index.js",
      "src/definitions.js",
      "agents/placeholder.txt",
      "skills/issue-workflow/SKILL.md",
      "skills/issue-workflow/scripts/normalize-index-modes.py",
    ]) {
      assert.ok(
        pack.files.some((file) => file.path === path),
        `missing ${path}`,
      );
    }
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        join(root, pack.filename),
      ],
      { cwd: consumer, stdio: "pipe" },
    );
    await writeFile(
      join(
        consumer,
        "node_modules",
        "@lengors-labs",
        "cadre",
        "agents",
        "reviewer.md",
      ),
      `---
mode: subagent
tier: review
permissions:
  - { action: "*", resource: "*", effect: deny }
---
Review changes.
`,
    );
    const script = `
    import plugin from '@lengors-labs/cadre';
    import assert from 'node:assert/strict';
    const skills = [];
    let transform;
    await plugin.setup({
      options: { tiers: { review: 'example/model#high' } },
      agent: { transform: async callback => { transform = callback; } },
      skill: { transform: async callback => callback({ get: () => undefined, add: skill => skills.push(skill) }) },
    });
    for (let i = 0; i < 2; i++) {
      let agent;
      transform({ get: () => undefined, update: (id, apply) => { assert.equal(id, 'reviewer'); agent = { request: {} }; apply(agent); } });
      assert.deepEqual(agent.model, { providerID: 'example', id: 'model', variant: 'high' });
      assert.equal('tier' in agent, false);
    }
    const warnings = [];
    console.warn = message => warnings.push(message);
    await plugin.setup({
      agent: { transform: async callback => { transform = callback; } },
      skill: { transform: async () => {} },
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /reviewer.*review.*inheriting/);
    for (let i = 0; i < 2; i++) {
      let agent;
      transform({ get: () => undefined, update: (_id, apply) => { agent = { request: {} }; apply(agent); } });
      assert.equal(agent.model, undefined);
    }
    assert.equal(warnings.length, 1);
    assert.equal(plugin.id, 'cadre');
    assert.equal(skills[0].id, 'issue-workflow');
    assert.ok(skills[0].path.includes('node_modules'));
  `;
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: consumer,
      stdio: "pipe",
    });
  },
);
