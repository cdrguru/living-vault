// A hook attachment subtype counts as a failed fire when it errored or was
// cancelled; every other subtype (success, context injection, system message)
// is a successful fire. Subtypes without a duration carry no latency.
const HOOK_ERROR_SUBTYPES = new Set([
  "hook_non_blocking_error",
  "hook_cancelled",
]);

const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/;

/**
 * Extract metadata-only usage events from one transcript's JSONL text.
 *
 * Three event sources, all identity-only (never message text, prompts, input
 * bodies, hook command strings, or command args):
 *  - tool_use blocks (assistant) paired with tool_result blocks (user) by id;
 *  - hook fires, recorded as top-level type:"attachment" entries that carry a
 *    string attachment.hookName (success/error/latency come off the attachment);
 *  - slash-command invocations, recorded as type:"user" entries whose
 *    message.content is a string holding <command-name>/slug</command-name>.
 *
 * @returns {Array<{ name: string, subagentType?: string, skill?: string,
 *   workflow?: string, mcpServer?: string, model?: string, attributionSkill?: string,
 *   attributionAgent?: string, attributionMcpServer?: string,
 *   hookName?: string, hookEvent?: string, command?: string, ts: number,
 *   latencyMs?: number, isError?: boolean }>}
 */
export function extractEvents(jsonlText) {
  const uses = [];
  const useIds = new Set();
  const resultById = new Map();
  const standalone = [];

  for (const line of jsonlText.split("\n")) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;

    // Hook fire: a top-level attachment entry with a hook identity. Non-hook
    // attachments (task_reminder, skill_listing, ...) have no hookName and skip.
    if (
      obj.type === "attachment" &&
      typeof obj.attachment?.hookName === "string"
    ) {
      const att = obj.attachment;
      standalone.push({
        name: "hook",
        hookName: att.hookName,
        hookEvent:
          typeof att.hookEvent === "string" ? att.hookEvent : undefined,
        ts,
        latencyMs: Number.isFinite(att.durationMs) ? att.durationMs : undefined,
        isError: HOOK_ERROR_SUBTYPES.has(att.type),
      });
      continue;
    }

    // Slash command: a user entry whose content is a string with a command tag.
    // Commands have no paired result, so success and latency are unavailable.
    if (obj.type === "user" && typeof obj.message?.content === "string") {
      const match = obj.message.content.match(COMMAND_NAME_RE);
      if (match) {
        standalone.push({
          name: "command",
          command: match[1].replace(/^\//, ""),
          ts,
        });
      }
      continue;
    }

    const content =
      obj.message && Array.isArray(obj.message.content)
        ? obj.message.content
        : [];
    for (const block of content) {
      if (block.type === "tool_use" && obj.type === "assistant") {
        // A retried/rewritten assistant turn can repeat the same tool_use block
        // (same id) on a later line; one id is one fire, so count it once.
        if (typeof block.id === "string") {
          if (useIds.has(block.id)) continue;
          useIds.add(block.id);
        }
        const input = block.input || {};
        uses.push({
          id: block.id,
          name: block.name,
          subagentType: input.subagent_type,
          skill: input.skill,
          workflow: block.name === "Workflow" ? input.name : undefined,
          mcpServer:
            typeof block.name === "string" && block.name.startsWith("mcp__")
              ? block.name.split("__")[1]
              : undefined,
          // Model behind this tool fire, from the same assistant line's usage-bearing
          // header. Identity only. Defaults to "unknown" downstream in aggregate.mjs.
          model:
            typeof obj.message?.model === "string"
              ? obj.message.model
              : undefined,
          // The asset the transcript stamped as active when this tool fired, used by
          // resolve.mjs as an ambient-attribution fallback for unattributed Bash/Read:
          // attributionSkill on the main thread, attributionAgent inside a subagent's
          // own transcript, attributionMcpServer when an MCP context is active.
          attributionSkill:
            typeof obj.attributionSkill === "string"
              ? obj.attributionSkill
              : undefined,
          attributionAgent:
            typeof obj.attributionAgent === "string"
              ? obj.attributionAgent
              : undefined,
          attributionMcpServer:
            typeof obj.attributionMcpServer === "string"
              ? obj.attributionMcpServer
              : undefined,
          ts,
        });
      } else if (block.type === "tool_result" && obj.type === "user") {
        resultById.set(block.tool_use_id, {
          isError: Boolean(block.is_error),
          ts,
        });
      }
    }
  }

  const toolEvents = uses.map((use) => {
    const result = resultById.get(use.id);
    return {
      name: use.name,
      subagentType: use.subagentType,
      skill: use.skill,
      workflow: use.workflow,
      mcpServer: use.mcpServer,
      model: use.model,
      attributionSkill: use.attributionSkill,
      attributionAgent: use.attributionAgent,
      attributionMcpServer: use.attributionMcpServer,
      ts: use.ts,
      latencyMs:
        result && Number.isFinite(result.ts) && Number.isFinite(use.ts)
          ? Math.max(0, result.ts - use.ts)
          : undefined,
      isError: result ? result.isError : undefined,
    };
  });

  return [...toolEvents, ...standalone];
}
