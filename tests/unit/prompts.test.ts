import { describe, expect, it } from "vitest";
import { applicableRecipes, promptCatalog } from "../../src/server/prompts.js";
import { toolCatalog } from "../../src/tools/catalog.js";

const allToolNames = new Set(toolCatalog.map((descriptor) => descriptor.name));

describe("prompt recipes", () => {
  // The gate is silent by design: a recipe naming a tool that does not exist
  // would simply never register, and nothing would say why.
  it("only reference tools that actually exist in the catalog", () => {
    const unknown = promptCatalog.flatMap((recipe) =>
      recipe.requires.filter((tool) => !allToolNames.has(tool)).map((tool) => `${recipe.name} -> ${tool}`)
    );

    expect(unknown).toEqual([]);
  });

  it("all register when every tool is available", () => {
    expect(applicableRecipes(allToolNames)).toHaveLength(promptCatalog.length);
  });

  it("register none when no tools are available", () => {
    expect(applicableRecipes(new Set())).toEqual([]);
  });

  // Offering a recipe the install cannot run turns the one feature meant to
  // help a newcomer start into their first error message.
  it("drop a recipe whose tools were filtered out by policy", () => {
    const withoutBackups = new Set(allToolNames);
    withoutBackups.delete("pve_list_backup_jobs");

    const names = applicableRecipes(withoutBackups).map((recipe) => recipe.name);

    expect(names).not.toContain("backup-audit");
    expect(names).toContain("cluster-health");
  });

  it("are all read-only, so they survive the most restricted tier", () => {
    const readOnlyTools = new Set(
      toolCatalog.filter((descriptor) => descriptor.accessTier === "read-only").map((descriptor) => descriptor.name)
    );

    expect(applicableRecipes(readOnlyTools)).toHaveLength(promptCatalog.length);
  });

  it("have unique names and a non-empty body", () => {
    const names = promptCatalog.map((recipe) => recipe.name);

    expect(new Set(names).size).toBe(names.length);
    for (const recipe of promptCatalog) {
      expect(recipe.body.trim().length).toBeGreaterThan(0);
      expect(recipe.requires.length).toBeGreaterThan(0);
    }
  });
});
