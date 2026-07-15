/**
 * Build a lookup of catalog assets keyed by "type:slug".
 * @returns {Map<string, { id: string, tenantId: string }>}
 */
export function buildCatalogIndex(catalog) {
  const index = new Map();
  for (const asset of catalog.assets || []) {
    index.set(`${asset.type}:${asset.slug}`, {
      id: asset.id,
      tenantId: asset.tenantId,
    });
  }
  return index;
}

/**
 * Map one event to a catalog asset, or null (unattributed / ignored built-in).
 * @param {object} event - a RawEvent from extract.mjs
 * @param {Map} index - from buildCatalogIndex
 * @param {Record<string,string>} [aliases] - "type:ccSlug" -> catalogSlug
 */
// Strip a leading plugin namespace ("superpowers:brainstorming" -> "brainstorming",
// "skill-creator:skill-creator" -> "skill-creator"). Returns undefined when there is
// no namespace to strip.
function namespaceTail(value) {
  const at = value.lastIndexOf(":");
  return at >= 0 ? value.slice(at + 1) : undefined;
}

// Normalize a hook identity ("PostToolUse:Edit") to the kebab slug a hook asset
// carries ("posttooluse-edit"). Same slug step as realAssetId, so the overlay id
// cc-hook-<slug> and this lookup agree.
function hookSlug(hookName) {
  return hookName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveEvent(event, index, aliases = {}) {
  const candidates = [];
  if (event.subagentType) {
    candidates.push(["subagent", event.subagentType]);
    const tail = namespaceTail(event.subagentType);
    if (tail) candidates.push(["subagent", tail]);
  }
  if (event.skill) {
    candidates.push(["skill", event.skill]);
    candidates.push(["command", event.skill]);
    const tail = namespaceTail(event.skill);
    if (tail) {
      candidates.push(["skill", tail]);
      candidates.push(["command", tail]);
    }
  }
  if (event.mcpServer) candidates.push(["mcp-server", event.mcpServer]);
  if (event.workflow) candidates.push(["workflow", event.workflow]);
  if (event.hookName) candidates.push(["hook", hookSlug(event.hookName)]);
  // A slash command may be its own command asset, front a skill of the same
  // name, or be a prompt-library entry exposed as a slash prompt; try all three,
  // and the namespace tail (superpowers:brainstorming, pbi-pack:star-schema...).
  if (event.command) {
    candidates.push(["command", event.command]);
    candidates.push(["skill", event.command]);
    candidates.push(["prompt", event.command]);
    const tail = namespaceTail(event.command);
    if (tail) {
      candidates.push(["command", tail]);
      candidates.push(["skill", tail]);
      candidates.push(["prompt", tail]);
    }
  }
  // Ambient attribution: a Bash/Read fire under an active asset carries no tool
  // identity of its own, but the transcript stamped which asset was active. Try
  // these only after every explicit-identity candidate above, so an explicit
  // subagent, mcp, hook, workflow, or skill invocation always wins over an ambient
  // stamp. attributionSkill is the main-thread skill; attributionAgent is the
  // subagent whose own transcript this fire ran in; attributionMcpServer is an
  // active MCP context. Skill is tried first as the most action-specific.
  if (event.attributionSkill) {
    candidates.push(["skill", event.attributionSkill]);
    const tail = namespaceTail(event.attributionSkill);
    if (tail) candidates.push(["skill", tail]);
  }
  if (event.attributionAgent) {
    candidates.push(["subagent", event.attributionAgent]);
    const tail = namespaceTail(event.attributionAgent);
    if (tail) candidates.push(["subagent", tail]);
  }
  if (event.attributionMcpServer) {
    candidates.push(["mcp-server", event.attributionMcpServer]);
    const tail = namespaceTail(event.attributionMcpServer);
    if (tail) candidates.push(["mcp-server", tail]);
  }

  for (const [type, rawSlug] of candidates) {
    const slug = aliases[`${type}:${rawSlug}`] || rawSlug;
    const hit = index.get(`${type}:${slug}`);
    if (hit) return hit;
  }
  return null;
}
