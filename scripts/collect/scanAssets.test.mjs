import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assetFromFile,
  assetOwnership,
  parseFrontmatter,
  scanClaudeAssets,
  slugify,
} from "./scanAssets.mjs";

describe("slugify", () => {
  it("kebab-cases and is idempotent on an already-kebab name", () => {
    expect(slugify("Align Root Docs")).toBe("align-root-docs");
    expect(slugify("align-root-docs")).toBe("align-root-docs");
    expect(slugify("  Foo:Bar!! ")).toBe("foo-bar");
  });
});

describe("parseFrontmatter", () => {
  it("splits single-line frontmatter from the body and strips quotes", () => {
    const { frontmatter, body } = parseFrontmatter(
      '---\nname: align-root-docs\ndescription: "Use when X"\n---\n# Title\n\nbody text',
    );
    expect(frontmatter.name).toBe("align-root-docs");
    expect(frontmatter.description).toBe("Use when X");
    expect(body).toBe("# Title\n\nbody text");
  });

  it("returns empty frontmatter and the whole content as body when there is none", () => {
    const { frontmatter, body } = parseFrontmatter(
      "# Just a doc\n\nno frontmatter",
    );
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just a doc\n\nno frontmatter");
  });
});

describe("assetFromFile", () => {
  it("builds a contribution row, preferring frontmatter name over the file name", () => {
    const asset = assetFromFile({
      type: "skill",
      name: "dir-name",
      content: "---\nname: My Skill\ndescription: does things\n---\nthe body",
    });
    expect(asset).toEqual({
      type: "skill",
      name: "My Skill",
      slug: "my-skill",
      description: "does things",
      body: "the body",
      version: "1.0.0",
    });
  });

  it("falls back to the file name and defaults when frontmatter is absent", () => {
    const asset = assetFromFile({
      type: "subagent",
      name: "code-reviewer",
      content: "no frontmatter here",
    });
    expect(asset).toMatchObject({
      type: "subagent",
      name: "code-reviewer",
      slug: "code-reviewer",
      version: "1.0.0",
    });
    expect(asset.body).toBe("no frontmatter here");
  });

  it("returns null when there is no usable name", () => {
    expect(assetFromFile({ type: "skill", name: "", content: "x" })).toBeNull();
  });
});

describe("scanClaudeAssets (fixture)", () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lv-claude-"));
    const skill = (root, name) => {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(
        join(root, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: d\n---\nbody`,
      );
    };
    skill(join(dir, "skills"), "my-skill");
    // a plugin skill at varying depth, the surface the standalone collector adds
    skill(join(dir, "plugins", "marketplaces", "mp", "skills"), "plugin-skill");
    mkdirSync(join(dir, "agents"), { recursive: true });
    writeFileSync(join(dir, "agents", "code-reviewer.md"), "an agent");
    // EISDIR trap: a directory whose name ends in .md must not abort the scan.
    mkdirSync(join(dir, "agents", "trap.md"), { recursive: true });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("scans user skills, plugin skills, and agents without crashing on a .md dir", () => {
    const assets = scanClaudeAssets(dir);
    const key = (a) => `${a.type}:${a.slug}`;
    const keys = assets.map(key);
    expect(keys).toContain("skill:my-skill");
    expect(keys).toContain("skill:plugin-skill");
    expect(keys).toContain("subagent:code-reviewer");
    // The trap directory contributed nothing and did not throw.
    expect(keys).not.toContain("subagent:trap");
  });

  it("dedupes by (type, slug)", () => {
    const assets = scanClaudeAssets(dir);
    expect(new Set(assets.map((a) => `${a.type}:${a.slug}`)).size).toBe(
      assets.length,
    );
  });
});

describe("assetOwnership", () => {
  it("calls a plugin-cache file vendored: the plugin manager rewrites it on update", () => {
    // This is the classification that stops the worklist proposing to retire 9 skills
    // the practitioner does not own. Deleting one retires nothing; the next
    // `claude plugin marketplace update` puts it straight back.
    expect(
      assetOwnership(
        "/Users/u/.claude/plugins/cache/claude-plugins-official/plugin-dev/unknown/skills/hook-development/SKILL.md",
      ),
    ).toBe("vendored");
  });

  it("calls a marketplace-cache file vendored", () => {
    expect(
      assetOwnership(
        "/Users/u/.claude/plugins/marketplaces/fabric-collection/plugins/powerbi-authoring/skills/x/SKILL.md",
      ),
    ).toBe("vendored");
  });

  it("calls the user's own skill owned", () => {
    expect(assetOwnership("/Users/u/.claude/skills/library/SKILL.md")).toBe("owned");
  });

  it("calls a LOCAL plugin owned, because nothing regenerates it", () => {
    // plugins/local/ is installed from disk by the practitioner (often a symlink to
    // their own repo). An edit there persists, so it is theirs to retire. Lumping it
    // in with the caches would silently exempt the user's own work from every rule.
    expect(
      assetOwnership("/Users/u/.claude/plugins/local/power-bi-development/skills/x/SKILL.md"),
    ).toBe("owned");
  });

  it("does not classify on a substring that merely looks like a cache path", () => {
    // "cache" as an ordinary directory name under the user's own skills is not a
    // plugin cache; only plugins/<cache|marketplaces>/ is.
    expect(assetOwnership("/Users/u/.claude/skills/cache-warming/SKILL.md")).toBe("owned");
    expect(assetOwnership("/Users/u/projects/plugins/SKILL.md")).toBe("owned");
  });

  it("falls back to the link text rather than throwing on a dangling symlink", () => {
    expect(
      assetOwnership("/nonexistent/.claude/plugins/cache/p/v/skills/x/SKILL.md"),
    ).toBe("vendored");
    expect(assetOwnership("/nonexistent/.claude/skills/x/SKILL.md")).toBe("owned");
  });
});

describe("findSkillFiles: a local plugin is usually a symlink to the author's repo", () => {
  it("follows a symlinked plugin dir and matches lowercase skill.md", () => {
    // Both halves of this were real, and together they hid 24 of the owner's OWN
    // workspace skills from the Vault entirely: readdir reports a symlinked directory
    // with isDirectory() === false, so the walk skipped the whole plugin, and the
    // workspace authors lowercase `skill.md` while marketplace plugins ship `SKILL.md`.
    const root = mkdtempSync(join(tmpdir(), "lv-symlink-"));
    const repo = join(root, "repo", "skills", "my-skill");
    const claude = join(root, ".claude");
    mkdirSync(repo, { recursive: true });
    mkdirSync(join(claude, "plugins", "local", "mine"), { recursive: true });
    writeFileSync(
      join(repo, "skill.md"), // lowercase, as the workspace authors them
      "---\nname: my-skill\ndescription: d\n---\nbody",
    );
    symlinkSync(
      join(root, "repo", "skills"),
      join(claude, "plugins", "local", "mine", "skills"),
    );

    const assets = scanClaudeAssets(claude);
    expect(assets.map((a) => a.slug)).toContain("my-skill");
    rmSync(root, { recursive: true, force: true });
  });

  it("survives a symlink cycle instead of recursing until the depth cap", () => {
    const root = mkdtempSync(join(tmpdir(), "lv-cycle-"));
    const claude = join(root, ".claude");
    const plugins = join(claude, "plugins", "p");
    mkdirSync(plugins, { recursive: true });
    writeFileSync(join(plugins, "SKILL.md"), "---\nname: loopy\n---\nb");
    symlinkSync(plugins, join(plugins, "self")); // p/self -> p
    const assets = scanClaudeAssets(claude);
    expect(assets.map((a) => a.slug)).toContain("loopy");
    rmSync(root, { recursive: true, force: true });
  });

  it("ignores a dangling symlink rather than throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "lv-dangle-"));
    const claude = join(root, ".claude");
    mkdirSync(join(claude, "plugins", "p"), { recursive: true });
    symlinkSync(join(root, "nowhere"), join(claude, "plugins", "p", "skills"));
    expect(() => scanClaudeAssets(claude)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});
