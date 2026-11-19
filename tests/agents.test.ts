import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { loadAgents, resolveAgentTiers } from "../src/definitions.js";

const rule = (action: string, resource: string, effect: "allow" | "deny") => ({
  action,
  resource,
  effect,
});
const common = [
  rule("*", "*", "deny"),
  rule("read", "*", "allow"),
  rule("read", "*.env", "deny"),
  rule("read", "*.env.*", "deny"),
  rule("glob", "*", "allow"),
  rule("grep", "*", "allow"),
];
const web = [rule("webfetch", "*", "allow"), rule("websearch", "*", "allow")];
const github = [
  "get_file_contents",
  "list_issues",
  "search_issues",
  "issue_read",
  "search_pull_requests",
  "list_commits",
  "list_tags",
  "get_latest_release",
].map((name) => rule(`github_${name}`, "*", "allow"));

test("shipped read-only agents have exact ordered capability boundaries", async () => {
  const agents = await loadAgents(join(process.cwd(), "agents"));
  const expected = [
    { id: "architect", tier: "design", permissions: common },
    {
      id: "researcher",
      tier: "research",
      permissions: [...common, ...web, ...github],
    },
    {
      id: "reviewer",
      tier: "review",
      permissions: [...common, ...web, rule("subagent", "verifier", "allow")],
    },
  ];
  assert.deepEqual(
    agents.map((agent) => agent.id),
    expected.map((agent) => agent.id),
  );
  for (const [index, agent] of agents.entries()) {
    assert.equal(agent.mode, "subagent");
    assert.equal(agent.tier, expected[index].tier);
    assert.equal(agent.steps, undefined);
    assert.ok(agent.description);
    assert.ok(agent.system?.includes("read-only"));
    assert.equal(agent.model, undefined);
    assert.deepEqual(agent.permissions, expected[index].permissions);
  }
});

test("shipped tiers resolve consumer models or inherit with a warning", async () => {
  const agents = await loadAgents(join(process.cwd(), "agents"));
  const warnings: string[] = [];
  const mapped = resolveAgentTiers(
    agents,
    {
      tiers: {
        design: "example/design#high",
        research: "example/research",
        review: "example/review",
      },
    },
    (message) => warnings.push(message),
  );
  assert.deepEqual(
    mapped.map((agent) => agent.model?.id),
    ["design", "research", "review"],
  );
  assert.equal(mapped[0].model?.variant, "high");
  assert.equal(warnings.length, 0);
  const unmapped = resolveAgentTiers(agents, undefined, (message) =>
    warnings.push(message),
  );
  assert.ok(unmapped.every((agent) => agent.model === undefined));
  assert.equal(warnings.length, 3);
  for (const agent of agents)
    assert.ok(
      warnings.some((message) =>
        message.includes(`${agent.id} has unmapped tier ${agent.tier}`),
      ),
    );
});
