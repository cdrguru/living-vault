/**
 * Scan a user's ~/.claude for their agentic assets and shape them as Living Vault
 * contribution rows. Used by the standalone collector (living-vault-collect.mjs) so a
 * user with no copy of this repo can export their assets and their telemetry. Pure
 * parsing (parseFrontmatter / assetFromFile / slugify) is separated from the fs walk
 * (scanClaudeAssets) so the parsing is unit-tested without a filesystem.
 *
 * Sources: skills/<name>/SKILL.md and plugins/**\/SKILL.md (type "skill"),
 * agents/<name>.md ("subagent"), commands/<name>.md ("command"). Plugin skills are
 * included so namespaced usage (e.g. "superpowers:brainstorming") resolves via the
 * resolver's namespace tail. Each carries optional YAML frontmatter (name,
 * description, version); the rest of the contract is filled in by the app's
 * normalizeContribution on upload, so only minimal fields are emitted here.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Who owns the file an asset lives in, which decides what an agent may do to it.
 *
 * "vendored" means a plugin manager owns the file: it was unpacked from a marketplace
 * into a cache directory, and `claude plugin marketplace update` rewrites that
 * directory wholesale. Two consequences the worklist must respect:
 *
 *   1. Editing it is not durable. The next plugin update silently reverts the change,
 *      so an agent's work evaporates with no error.
 *   2. Deleting it does not retire anything. The plugin manager, not the practitioner,
 *      decides whether the skill exists; the file reappears on the next update.
 *
 * Its mtime is also not an authorship date. Every file in a cached plugin carries the
 * timestamp of the tarball extraction, so a whole plugin's skills report the identical
 * age, and that age says when the plugin was installed rather than when the skill was
 * last maintained. Staleness derived from it is the same class of fiction as the
 * catalog's synthesized updatedAt.
 *
 * `plugins/local/` is deliberately NOT vendored: a local plugin is installed from disk
 * by the practitioner (often a symlink to their own repo), nothing regenerates it, and
 * an edit there persists. Symlinks are resolved first, so a local plugin that points
 * into the owner's source tree classifies on where the file really is.
 */
export function assetOwnership(sourcePath) {
  let real = sourcePath;
  try {
    real = realpathSync(sourcePath);
  } catch {
    // A dangling or unreadable link: fall back to the literal path. Classifying on the
    // link text is still right, and refusing to classify would be worse.
  }
  const managed = /[/\\]plugins[/\\](cache|marketplaces)[/\\]/;
  return managed.test(real) || managed.test(sourcePath) ? "vendored" : "owned";
}

/** Kebab-case a name the same way the app's normalize.slugify does (idempotent). */
export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Split a markdown file into its YAML-ish frontmatter (single-line key: value pairs)
 * and the body below it. Tolerant: a file with no frontmatter returns {} and the whole
 * content as body. Quotes around values are stripped.
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) frontmatter[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: match[2].trim() };
}

/**
 * Turn one asset file into a contribution asset row, or null when it has no usable
 * name. The frontmatter name wins; otherwise the directory/file name is the fallback.
 * The slug falls back to "asset" exactly like the app's normalizeAsset, so a name that
 * kebab-cases to empty (non-Latin / punctuation-only) still aligns with the catalog.
 */
export function assetFromFile({ type, name, content }) {
  const { frontmatter, body } = parseFrontmatter(content);
  const assetName = (frontmatter.name || name || "").trim();
  if (!assetName) return null;
  return {
    type,
    name: assetName,
    slug: slugify(assetName) || "asset",
    description: (frontmatter.description || "").trim(),
    body,
    version: (frontmatter.version || "1.0.0").trim(),
  };
}

/**
 * Recursively collect every SKILL.md path under dir (bounded depth, fs-error safe).
 *
 * Two things this has to get right, both of which silently hid a whole plugin:
 *
 * **Symlinked directories.** A plugin installed from disk is usually a SYMLINK to the
 * author's own repo, which is what keeps it live-editable. `readdir` reports such a
 * directory with `isDirectory() === false` (it is a symlink, not a directory), so a
 * naive walk skips the entire plugin. Its skills exist, get invoked, and are invisible
 * to the Vault: zero assets, zero attribution, and their usage lands in `unattributed`.
 * We follow the link and guard against a cycle by realpath, since a symlink loop would
 * otherwise recurse until the depth cap on every scan.
 *
 * **Filename case.** Plugins from a marketplace ship `SKILL.md`; the workspace authors
 * lowercase `skill.md` (it is discovered fine on case-insensitive macOS and keeps the
 * packaging step working). An exact `=== "SKILL.md"` match finds the first and misses
 * the second, on a filesystem where both resolve to the same file.
 */
function findSkillFiles(dir, out, depth = 0, seen = new Set()) {
  if (depth > 10) return;
  let real;
  try {
    real = realpathSync(dir);
  } catch {
    return; // dangling link or unreadable: not an error, just nothing here
  }
  if (seen.has(real)) return;
  seen.add(real);

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const st = statSync(full); // follows the link
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue; // dangling
      }
    }
    if (isDir) findSkillFiles(full, out, depth + 1, seen);
    else if (isFile && entry.name.toLowerCase() === "skill.md") out.push(full);
  }
}

/**
 * Walk a ~/.claude directory and return every asset paired with the file it came
 * from, deduped by (type, slug). This is the ONLY place that knows where an asset
 * really lives: own skills, plugin-cache skills, agents, and commands all sit in
 * different layouts, so any second attempt to derive a path would drift from this.
 *
 * The pairing is kept internal on purpose. `sourcePath` is an owner-private absolute
 * path (it contains the username), and the two public consumers of this scan ship
 * their output elsewhere: living-vault-collect.mjs emits an artifact a SHARED user
 * uploads, and build-real-overlay.mjs feeds the catalog projection. Neither may carry
 * a path. So scanClaudeAssets() returns assets with no path at all, and the path is
 * available only through scanAssetSources(), whose one consumer writes it to a
 * gitignored local map. The separation makes the leak structurally impossible rather
 * than a thing reviewers must remember.
 *
 * Missing or unreadable source directories/files are skipped, so a stray non-file
 * entry (e.g. a directory named foo.md) can never abort the scan. The user's own
 * skills are scanned before plugin skills, so they win on a slug collision.
 *
 * @returns {Array<{ asset: object, sourcePath: string }>}
 */
export function scanClaudeAssetSources(claudeDir) {
  const found = [];
  const add = (type, name, file) => {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      return;
    }
    const asset = assetFromFile({ type, name, content });
    if (asset) found.push({ asset, sourcePath: file });
  };

  // skills/<name>/SKILL.md (the user's own skills)
  const skillsDir = join(claudeDir, "skills");
  let skillEntries = [];
  try {
    skillEntries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    skillEntries = [];
  }
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(skillsDir, entry.name, "SKILL.md");
    if (existsSync(skillMd)) add("skill", entry.name, skillMd);
  }

  // plugins/**/SKILL.md (marketplace + cached plugin skills, varying depth)
  const pluginSkills = [];
  findSkillFiles(join(claudeDir, "plugins"), pluginSkills);
  for (const file of pluginSkills) add("skill", basename(dirname(file)), file);

  // agents/<name>.md ("subagent"), commands/<name>.md ("command")
  for (const [dir, type] of [
    ["agents", "subagent"],
    ["commands", "command"],
  ]) {
    let entries = [];
    try {
      entries = readdirSync(join(claudeDir, dir), { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      add(
        type,
        entry.name.replace(/\.md$/, ""),
        join(claudeDir, dir, entry.name),
      );
    }
  }

  const seen = new Set();
  return found.filter(({ asset }) => {
    const key = `${asset.type}:${asset.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The user's assets, deduped by (type, slug), carrying NO source path. This is what
 * every catalog/upload path consumes; see scanClaudeAssetSources for why the path is
 * withheld here rather than stripped downstream.
 */
export function scanClaudeAssets(claudeDir) {
  return scanClaudeAssetSources(claudeDir).map(({ asset }) => asset);
}

/**
 * Identity -> absolute source path for every asset on this machine, plus who owns that
 * file. The only caller is scripts/vault-asset-paths.mjs, which writes a gitignored
 * local map so the worklist can point an agent at a real, editable file instead of
 * guessing one, and so it never proposes retiring a file the practitioner does not own.
 *
 * @returns {Array<{ type: string, slug: string, sourcePath: string, ownership: "owned" | "vendored" }>}
 */
export function scanAssetSources(claudeDir) {
  return scanClaudeAssetSources(claudeDir).map(({ asset, sourcePath }) => ({
    type: asset.type,
    slug: asset.slug,
    sourcePath,
    ownership: assetOwnership(sourcePath),
  }));
}
