import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("issue workflow uses local Git for commits and publishing", async () => {
  const workflow = await readFile("skills/issue-workflow/SKILL.md", "utf8");
  for (const requirement of [
    "local Git for commits and pushes",
    "Verify the configured author and committer identity before each commit",
    "Do not assume a\n  commit is signed",
    "git push --set-upstream",
  ])
    assert.ok(workflow.includes(requirement), requirement);
  assert.ok(!workflow.includes("MCP-only publishing path"));
});

test("issue-body updates restrict non-conditional writes to additive checkboxes", async () => {
  const workflow = await readFile("skills/issue-workflow/SKILL.md", "utf8");
  for (const requirement of [
    "Prefer an atomic conditional update",
    "without confirmation only for additive checklist updates",
    "never uncheck or alter tasks",
    "derive the targeted checkbox changes from that fresh body",
    "preserving every other byte",
    "verify both the targeted changes and that\nthe untouched remainder matches",
    "a concurrent edit between the final read and the write\ncan be lost",
    "stop and report the proposed edit for\nany other issue-body change",
    "apply it only after the user approves that specific edit",
  ])
    assert.ok(workflow.includes(requirement), requirement);
  assert.ok(!workflow.includes("even with confirmation"));
});

test("merge is explicit-instruction only and pinned to the reviewed head", async () => {
  const workflow = await readFile("skills/issue-workflow/SKILL.md", "utf8");
  for (const requirement of [
    "Do not merge by default",
    "explicitly requests that\n  specific merge in the current session",
    "Set `expectedHeadSha`",
    "if the head has advanced, stop and\n  re-verify",
    "never treat auto-merge as a substitute",
  ])
    assert.ok(workflow.includes(requirement), requirement);
  assert.ok(!workflow.includes("Do not merge the PR"));
});
