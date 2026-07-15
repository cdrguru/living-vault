import { describe, expect, it } from "vitest";

import { buildCatalogIndex, resolveEvent } from "./resolve.mjs";

const catalog = {
  assets: [
    { id: "a-sub", tenantId: "t1", type: "subagent", slug: "code-reviewer" },
    { id: "a-skill", tenantId: "t1", type: "skill", slug: "deep-research" },
    { id: "a-mcp", tenantId: "t1", type: "mcp-server", slug: "github-mcp" },
    { id: "a-hook", tenantId: "t1", type: "hook", slug: "posttooluse-edit" },
    { id: "a-cmd", tenantId: "t1", type: "command", slug: "do-thing" },
    {
      id: "a-prompt",
      tenantId: "t1",
      type: "prompt",
      slug: "star-schema-first-dax",
    },
  ],
};

describe("resolveEvent", () => {
  const index = buildCatalogIndex(catalog);

  it("resolves a subagent by subagent_type", () => {
    expect(
      resolveEvent({ name: "Agent", subagentType: "code-reviewer" }, index),
    ).toEqual({ id: "a-sub", tenantId: "t1" });
  });

  it("resolves a skill by name", () => {
    expect(
      resolveEvent({ name: "Skill", skill: "deep-research" }, index),
    ).toEqual({ id: "a-skill", tenantId: "t1" });
  });

  it("resolves an mcp server by the server segment", () => {
    expect(
      resolveEvent(
        { name: "mcp__github-mcp__list", mcpServer: "github-mcp" },
        index,
      ),
    ).toEqual({ id: "a-mcp", tenantId: "t1" });
  });

  it("returns null for built-in tools and unknown names", () => {
    expect(resolveEvent({ name: "Bash" }, index)).toBeNull();
    expect(
      resolveEvent({ name: "Agent", subagentType: "general-purpose" }, index),
    ).toBeNull();
  });

  it("applies the alias map before lookup", () => {
    expect(
      resolveEvent({ name: "Skill", skill: "dr" }, index, {
        "skill:dr": "deep-research",
      }),
    ).toEqual({ id: "a-skill", tenantId: "t1" });
  });

  it("attributes an ambient Bash fire to its active skill via attributionSkill", () => {
    expect(
      resolveEvent({ name: "Bash", attributionSkill: "deep-research" }, index),
    ).toEqual({
      id: "a-skill",
      tenantId: "t1",
    });
  });

  it("lets explicit tool identity win over an ambient attributionSkill", () => {
    expect(
      resolveEvent(
        {
          name: "Agent",
          subagentType: "code-reviewer",
          attributionSkill: "deep-research",
        },
        index,
      ),
    ).toEqual({ id: "a-sub", tenantId: "t1" });
  });

  it("attributes an ambient Bash fire to its subagent via attributionAgent", () => {
    expect(
      resolveEvent({ name: "Bash", attributionAgent: "code-reviewer" }, index),
    ).toEqual({
      id: "a-sub",
      tenantId: "t1",
    });
  });

  it("attributes an ambient fire to a plugin-namespaced subagent by its tail", () => {
    expect(
      resolveEvent(
        { name: "Read", attributionAgent: "review:code-reviewer" },
        index,
      ),
    ).toEqual({
      id: "a-sub",
      tenantId: "t1",
    });
  });

  it("attributes an ambient fire to its active mcp server via attributionMcpServer", () => {
    expect(
      resolveEvent({ name: "Read", attributionMcpServer: "github-mcp" }, index),
    ).toEqual({
      id: "a-mcp",
      tenantId: "t1",
    });
  });

  it("lets explicit tool identity win over an ambient attributionAgent", () => {
    expect(
      resolveEvent(
        {
          name: "Skill",
          skill: "deep-research",
          attributionAgent: "code-reviewer",
        },
        index,
      ),
    ).toEqual({ id: "a-skill", tenantId: "t1" });
  });

  it("resolves a plugin-namespaced skill by its tail segment", () => {
    expect(
      resolveEvent(
        { name: "Skill", skill: "superpowers:deep-research" },
        index,
      ),
    ).toEqual({
      id: "a-skill",
      tenantId: "t1",
    });
  });

  it("resolves a plugin-namespaced subagent by its tail segment", () => {
    expect(
      resolveEvent(
        { name: "Agent", subagentType: "review:code-reviewer" },
        index,
      ),
    ).toEqual({
      id: "a-sub",
      tenantId: "t1",
    });
  });

  it("resolves a hook by its normalized hookName slug", () => {
    expect(
      resolveEvent({ name: "hook", hookName: "PostToolUse:Edit" }, index),
    ).toEqual({
      id: "a-hook",
      tenantId: "t1",
    });
  });

  it("returns null for a hook with no matching asset", () => {
    expect(
      resolveEvent({ name: "hook", hookName: "PreToolUse:Bash" }, index),
    ).toBeNull();
  });

  it("resolves a command to a command asset", () => {
    expect(
      resolveEvent({ name: "command", command: "do-thing" }, index),
    ).toEqual({
      id: "a-cmd",
      tenantId: "t1",
    });
  });

  it("resolves a slash command to its underlying skill", () => {
    expect(
      resolveEvent({ name: "command", command: "deep-research" }, index),
    ).toEqual({
      id: "a-skill",
      tenantId: "t1",
    });
  });

  it("resolves a plugin-namespaced command to its underlying skill by tail", () => {
    expect(
      resolveEvent(
        { name: "command", command: "superpowers:deep-research" },
        index,
      ),
    ).toEqual({
      id: "a-skill",
      tenantId: "t1",
    });
  });

  it("resolves a slash command to a prompt asset of the same slug", () => {
    expect(
      resolveEvent(
        { name: "command", command: "star-schema-first-dax" },
        index,
      ),
    ).toEqual({
      id: "a-prompt",
      tenantId: "t1",
    });
  });

  it("resolves a plugin-namespaced command to a prompt by its tail", () => {
    expect(
      resolveEvent(
        { name: "command", command: "pbi-pack:star-schema-first-dax" },
        index,
      ),
    ).toEqual({
      id: "a-prompt",
      tenantId: "t1",
    });
  });
});
