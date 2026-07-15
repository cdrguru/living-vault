import { describe, expect, it } from "vitest";

import { extractEvents } from "./extract.mjs";

const transcript = [
  {
    type: "assistant",
    timestamp: "2026-06-07T00:00:00.000Z",
    message: {
      content: [
        {
          type: "tool_use",
          id: "u1",
          name: "Agent",
          input: { subagent_type: "code-reviewer", prompt: "secret" },
        },
      ],
    },
  },
  {
    type: "user",
    timestamp: "2026-06-07T00:00:02.000Z",
    message: {
      content: [{ type: "tool_result", tool_use_id: "u1", is_error: false }],
    },
  },
  {
    type: "assistant",
    timestamp: "2026-06-07T00:00:05.000Z",
    message: {
      content: [
        {
          type: "tool_use",
          id: "u2",
          name: "mcp__github-mcp__list",
          input: {},
        },
      ],
    },
  },
  {
    type: "user",
    timestamp: "2026-06-07T00:00:06.000Z",
    message: {
      content: [{ type: "tool_result", tool_use_id: "u2", is_error: true }],
    },
  },
  {
    type: "assistant",
    timestamp: "2026-06-07T00:00:09.000Z",
    message: {
      content: [
        {
          type: "tool_use",
          id: "u3",
          name: "Skill",
          input: { skill: "deep-research" },
        },
      ],
    },
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("extractEvents", () => {
  it("pairs tool_use (assistant) with tool_result (user) by id", () => {
    const events = extractEvents(transcript);
    expect(events).toHaveLength(3);
    const agent = events.find((e) => e.name === "Agent");
    expect(agent.subagentType).toBe("code-reviewer");
    expect(agent.isError).toBe(false);
    expect(agent.latencyMs).toBe(2000);
  });

  it("derives mcpServer from the tool name and reads is_error", () => {
    const mcp = extractEvents(transcript).find((e) =>
      e.name.startsWith("mcp__"),
    );
    expect(mcp.mcpServer).toBe("github-mcp");
    expect(mcp.isError).toBe(true);
    expect(mcp.latencyMs).toBe(1000);
  });

  it("counts an unpaired tool_use with no latency or isError", () => {
    const skill = extractEvents(transcript).find(
      (e) => e.skill === "deep-research",
    );
    expect(skill.latencyMs).toBeUndefined();
    expect(skill.isError).toBeUndefined();
  });

  it("never carries message text, prompts, or input bodies", () => {
    const json = JSON.stringify(extractEvents(transcript));
    expect(json).not.toContain("secret");
    expect(json).not.toContain("prompt");
  });

  it("counts a repeated tool_use id once (a rewritten turn repeats the block)", () => {
    // 46 real fires were double-counted this way: the same tool_use block (same
    // id) appears on more than one assistant line of a transcript.
    const dup = [
      {
        type: "assistant",
        timestamp: "2026-06-07T00:00:00.000Z",
        message: { content: [{ type: "tool_use", id: "d1", name: "Bash", input: {} }] },
      },
      {
        type: "assistant",
        timestamp: "2026-06-07T00:00:01.000Z",
        message: { content: [{ type: "tool_use", id: "d1", name: "Bash", input: {} }] },
      },
      {
        type: "user",
        timestamp: "2026-06-07T00:00:03.000Z",
        message: { content: [{ type: "tool_result", tool_use_id: "d1", is_error: false }] },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const events = extractEvents(dup);
    expect(events).toHaveLength(1);
    expect(events[0].isError).toBe(false);
    expect(events[0].latencyMs).toBe(3000);
  });
});

const hookTranscript = [
  {
    type: "attachment",
    timestamp: "2026-06-07T00:00:00.000Z",
    attachment: {
      type: "hook_success",
      hookEvent: "PostToolUse",
      hookName: "PostToolUse:Edit",
      exitCode: 0,
      durationMs: 120,
      command: '"${CLAUDE_PLUGIN_ROOT}/scripts/secret-format.sh"',
    },
  },
  {
    type: "attachment",
    timestamp: "2026-06-07T00:00:01.000Z",
    attachment: {
      type: "hook_non_blocking_error",
      hookEvent: "PreToolUse",
      hookName: "PreToolUse:Bash",
      exitCode: 127,
      durationMs: 50,
      command: '"${CLAUDE_PLUGIN_ROOT}/scripts/secret-guard.sh"',
    },
  },
  {
    type: "attachment",
    timestamp: "2026-06-07T00:00:02.000Z",
    attachment: {
      type: "hook_additional_context",
      hookEvent: "SessionStart",
      hookName: "SessionStart:startup",
      content: ["secret context"],
    },
  },
  {
    type: "attachment",
    timestamp: "2026-06-07T00:00:03.000Z",
    attachment: { type: "task_reminder" },
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("extractEvents hooks", () => {
  it("emits a hook event per hook attachment, ignoring non-hook attachments", () => {
    const events = extractEvents(hookTranscript);
    const hooks = events.filter((e) => e.name === "hook");
    expect(hooks).toHaveLength(3);
    expect(events.some((e) => e.hookEvent === "task_reminder")).toBe(false);
  });

  it("reads success and latency from a hook_success attachment", () => {
    const ok = extractEvents(hookTranscript).find(
      (e) => e.hookName === "PostToolUse:Edit",
    );
    expect(ok.name).toBe("hook");
    expect(ok.hookEvent).toBe("PostToolUse");
    expect(ok.isError).toBe(false);
    expect(ok.latencyMs).toBe(120);
  });

  it("marks a hook_non_blocking_error as an error with its duration", () => {
    const err = extractEvents(hookTranscript).find(
      (e) => e.hookName === "PreToolUse:Bash",
    );
    expect(err.isError).toBe(true);
    expect(err.latencyMs).toBe(50);
  });

  it("counts a context-injection hook with no latency", () => {
    const ctx = extractEvents(hookTranscript).find(
      (e) => e.hookName === "SessionStart:startup",
    );
    expect(ctx.isError).toBe(false);
    expect(ctx.latencyMs).toBeUndefined();
  });

  it("never carries the hook command string or injected content", () => {
    const json = JSON.stringify(extractEvents(hookTranscript));
    expect(json).not.toContain("secret");
    expect(json).not.toContain("CLAUDE_PLUGIN_ROOT");
  });
});

const commandTranscript = [
  {
    type: "user",
    timestamp: "2026-06-07T00:00:00.000Z",
    message: {
      role: "user",
      content:
        "<command-message>brainstorming</command-message>\n<command-name>/superpowers:brainstorming</command-name>\n<command-args>secret topic</command-args>",
    },
  },
  {
    type: "user",
    timestamp: "2026-06-07T00:00:01.000Z",
    message: { role: "user", content: "<command-name>/effort</command-name>" },
  },
  {
    type: "user",
    timestamp: "2026-06-07T00:00:02.000Z",
    message: { role: "user", content: "just a normal message, no command" },
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("extractEvents commands", () => {
  it("emits a command event per <command-name>, ignoring plain user messages", () => {
    const commands = extractEvents(commandTranscript).filter(
      (e) => e.name === "command",
    );
    expect(commands).toHaveLength(2);
  });

  it("strips the leading slash from the command slug", () => {
    const cmd = extractEvents(commandTranscript).find(
      (e) => e.command === "superpowers:brainstorming",
    );
    expect(cmd).toBeDefined();
    expect(cmd.name).toBe("command");
    expect(
      extractEvents(commandTranscript).some((e) => e.command === "effort"),
    ).toBe(true);
  });

  it("reports no success or latency for a command (no result signal exists)", () => {
    const cmd = extractEvents(commandTranscript).find(
      (e) => e.command === "effort",
    );
    expect(cmd.isError).toBeUndefined();
    expect(cmd.latencyMs).toBeUndefined();
  });

  it("never carries the command message or args", () => {
    const json = JSON.stringify(extractEvents(commandTranscript));
    expect(json).not.toContain("secret");
    expect(json).not.toContain("topic");
  });
});

const attributedTranscript = [
  {
    type: "assistant",
    timestamp: "2026-06-07T00:00:00.000Z",
    attributionSkill: "deep-research",
    message: {
      model: "claude-opus-4-8",
      content: [
        {
          type: "tool_use",
          id: "a1",
          name: "Bash",
          input: { command: "secret-script" },
        },
      ],
    },
  },
  {
    type: "user",
    timestamp: "2026-06-07T00:00:01.000Z",
    message: {
      content: [{ type: "tool_result", tool_use_id: "a1", is_error: false }],
    },
  },
  {
    type: "assistant",
    timestamp: "2026-06-07T00:00:05.000Z",
    message: {
      model: "claude-sonnet-4-6",
      content: [
        {
          type: "tool_use",
          id: "a2",
          name: "Skill",
          input: { skill: "deep-research" },
        },
      ],
    },
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("extractEvents model and attribution", () => {
  it("stamps model from the parent assistant line message.model", () => {
    const events = extractEvents(attributedTranscript);
    const bash = events.find((e) => e.name === "Bash");
    const skill = events.find((e) => e.skill === "deep-research");
    expect(bash.model).toBe("claude-opus-4-8");
    expect(skill.model).toBe("claude-sonnet-4-6");
  });

  it("stamps the top-level attributionSkill onto a tool_use event", () => {
    const bash = extractEvents(attributedTranscript).find(
      (e) => e.name === "Bash",
    );
    expect(bash.attributionSkill).toBe("deep-research");
  });

  it("stamps top-level attributionAgent and attributionMcpServer onto a tool_use event", () => {
    const transcript = [
      {
        type: "assistant",
        timestamp: "2026-06-07T00:00:00.000Z",
        attributionAgent: "review:code-reviewer",
        attributionMcpServer: "github-mcp",
        message: {
          model: "claude-opus-4-8",
          content: [{ type: "tool_use", id: "z1", name: "Read", input: {} }],
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const read = extractEvents(transcript).find((e) => e.name === "Read");
    expect(read.attributionAgent).toBe("review:code-reviewer");
    expect(read.attributionMcpServer).toBe("github-mcp");
  });

  it("leaves model and attribution stamps undefined when absent", () => {
    const skill = extractEvents(attributedTranscript).find(
      (e) => e.skill === "deep-research",
    );
    expect(skill.attributionSkill).toBeUndefined();
    expect(skill.attributionAgent).toBeUndefined();
    expect(skill.attributionMcpServer).toBeUndefined();
  });

  it("still carries no input bodies when stamping attribution", () => {
    const json = JSON.stringify(extractEvents(attributedTranscript));
    expect(json).not.toContain("secret-script");
    expect(json).not.toContain("command");
  });
});
