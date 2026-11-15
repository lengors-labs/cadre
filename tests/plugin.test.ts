import assert from "node:assert/strict";
import test from "node:test";
import { Agent, type Plugin } from "@opencode/plugin";
import plugin from "../src/index.js";

test("registers replay-safe transforms and makes the workflow skill available", async () => {
  const transforms: Record<string, (editor: never) => void> = {};
  const context = {
    agent: {
      transform: async (callback: (editor: never) => void) => {
        transforms.agent = callback;
      },
    },
    skill: {
      transform: async (callback: (editor: never) => void) => {
        transforms.skill = callback;
      },
    },
  } as unknown as Plugin.Context;
  assert.equal(plugin.id, "cadre");
  await plugin.setup(context);
  assert.ok(transforms.agent);
  assert.ok(transforms.skill);
  for (let i = 0; i < 2; i++) {
    const skills: { id: string; content: string }[] = [];
    transforms.skill({
      get: () => undefined,
      add: (skill: (typeof skills)[number]) => skills.push(skill),
    } as never);
    assert.equal(skills[0].id, "issue-workflow");
    assert.match(skills[0].content, /Issue-to-PR workflow/);
    transforms.agent({
      get: () => undefined,
      update: (id: string, apply: (agent: unknown) => void) => {
        apply(Agent.Info.default(Agent.ID.make(id)));
      },
    } as never);
  }
});
