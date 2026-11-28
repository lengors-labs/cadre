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
  const agents = (await loadAgents(join(process.cwd(), "agents"))).filter(
    (agent) => ["architect", "researcher", "reviewer"].includes(agent.id),
  );
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

test("writing and executing agents have exact ordered capability boundaries", async () => {
  const agents = (await loadAgents(join(process.cwd(), "agents"))).filter(
    (agent) => ["developer", "verifier", "docwriter"].includes(agent.id),
  );
  const base = [
    common[0],
    rule("external_directory", "*", "deny"),
    ...common.slice(1),
  ];
  const shell = [
    rule("shell", "*", "allow"),
    ...[
      "docker *rm*",
      "docker *prune*",
      "docker *deploy*",
      "git push *",
      "git reset --hard *",
      "git clean *",
    ].map((pattern) => rule("shell", pattern, "deny")),
  ];
  const execute = rule("execute", "*", "deny");
  const withEdit = [
    ...base.slice(0, 5),
    rule("edit", "*", "allow"),
    ...base.slice(5),
  ];
  const expected = [
    {
      id: "developer",
      tier: "coding",
      permissions: [
        ...withEdit,
        ...web,
        rule("subagent", "verifier", "allow"),
        ...shell,
        execute,
      ],
    },
    { id: "docwriter", tier: "writing", permissions: [...withEdit, execute] },
    {
      id: "verifier",
      tier: "verification",
      permissions: [...base, ...shell, execute],
    },
  ];
  assert.deepEqual(
    agents.map((agent) => agent.id),
    expected.map((agent) => agent.id),
  );
  for (const [index, agent] of agents.entries()) {
    assert.equal(agent.mode, "subagent");
    assert.equal(agent.tier, expected[index].tier);
    assert.equal(agent.model, undefined);
    assert.ok(agent.description && agent.system);
    assert.deepEqual(agent.permissions, expected[index].permissions);
  }
  for (const id of ["developer", "verifier"]) {
    const agent = agents.find((item) => item.id === id)!;
    assert.match(agent.system!, /docker --context <context> <subcommand>/);
    assert.match(agent.system!, /not a security boundary/);
  }
  assert.match(
    agents.find((agent) => agent.id === "verifier")!.system!,
    /Never deploy/,
  );
});

test("GitManager has the exclusive enumerated GitHub write boundary", async () => {
  const agents = await loadAgents(join(process.cwd(), "agents"));
  const manager = agents.find((agent) => agent.id === "gitmanager");
  assert.ok(manager);
  const writes = [
    "create_branch",
    "create_pull_request",
    "update_pull_request",
    "merge_pull_request",
    "add_issue_comment",
    "issue_write",
  ];
  const reads = [
    "get_me",
    "list_issues",
    "search_issues",
    "issue_read",
    "pull_request_read",
    "list_repository_collaborators",
    "search_users",
  ];
  assert.equal(manager.mode, "subagent");
  assert.equal(manager.tier, "mechanical");
  assert.equal(manager.model, undefined);
  const shell = [
    "git status*",
    "git diff*",
    "git ls-files*",
    "git ls-remote*",
    "git rev-parse*",
    "git merge-base*",
    "git log*",
    "git show*",
    "git remote -v*",
    "git branch --show-current*",
    "git branch -a*",
    "git worktree list*",
    "git config --get*",
    "git config --path --get*",
    "git config user.email",
    "git var*",
    "git add*",
    "git update-index*",
    "git commit*",
    "git push*",
  ].map((pattern) => rule("shell", pattern, "allow"));
  assert.deepEqual(manager.permissions, [
    ...common,
    rule("skill", "issue-workflow", "allow"),
    ...shell,
    rule("shell", "git push*--force*", "deny"),
    rule("shell", "git push* -f*", "deny"),
    ...[...writes, ...reads].map((name) =>
      rule(`github_${name}`, "*", "allow"),
    ),
  ]);
  for (const agent of agents.filter((agent) => agent.id !== manager.id)) {
    assert.ok(
      agent.permissions.every(
        (permission) =>
          permission.effect !== "allow" ||
          (!writes.some((name) => permission.action === `github_${name}`) &&
            permission.action !== "github_*" &&
            permission.action !== "*"),
      ),
      `${agent.id} must not allow GitHub writes`,
    );
  }
  for (const name of ["push_files", "create_or_update_file"])
    assert.ok(
      agents.every((agent) =>
        agent.permissions.every(
          (permission) =>
            permission.action !== `github_${name}` ||
            permission.effect !== "allow",
        ),
      ),
    );
  const merge = rule("github_merge_pull_request", "*", "allow");
  assert.ok(manager.permissions.some((p) => p.action === merge.action));
  for (const agent of agents.filter((agent) => agent.id !== manager.id))
    assert.ok(
      !agent.permissions.some((p) => p.action === merge.action),
      `${agent.id} must not merge pull requests`,
    );
  for (const phrase of [
    "codemode: false",
    "Never close issues",
    "force-push",
    "auto-merge",
    "explicit author or committer",
    "non-noreply",
    "guardrails, not a security",
    "Merging is instruction-only",
    "`expectedHeadSha`",
  ])
    assert.ok(manager.system?.includes(phrase), phrase);
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
        coding: "example/coding",
        verification: "example/verification",
        writing: "example/writing",
        mechanical: "example/mechanical#off",
      },
    },
    (message) => warnings.push(message),
  );
  assert.deepEqual(
    mapped.map((agent) => agent.model?.id),
    [
      "design",
      "coding",
      "writing",
      "mechanical",
      "research",
      "review",
      "verification",
    ],
  );
  assert.equal(mapped[0].model?.variant, "high");
  assert.equal(mapped[3].model?.variant, "off");
  assert.equal(warnings.length, 0);
  const unmapped = resolveAgentTiers(agents, undefined, (message) =>
    warnings.push(message),
  );
  assert.ok(unmapped.every((agent) => agent.model === undefined));
  assert.equal(warnings.length, agents.length);
  for (const agent of agents)
    assert.ok(
      warnings.some((message) =>
        message.includes(`${agent.id} has unmapped tier ${agent.tier}`),
      ),
    );
});
