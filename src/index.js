import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Plugin } from "@opencode/plugin";
import { loadAgents, loadSkills, registerAgents } from "./definitions.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Shell sandboxing is deferred; worker permission rules provide the initial
// guardrails. Any policy denying plugin.use must explicitly allow cadre.
export default Plugin.define({
  id: "cadre",
  async setup(ctx) {
    const agents = await loadAgents(join(root, "agents"));
    const skills = await loadSkills(join(root, "skills"));
    await ctx.agent.transform((editor) => {
      registerAgents(editor, agents);
    });
    await ctx.skill.transform((editor) => {
      for (const skill of skills) {
        if (!editor.get(skill.id)) editor.add(skill);
      }
    });
  },
});
