import { describe, expect, it } from "vitest";
import { classify, classifyCommit, nextVersion } from "../../scripts/next-version.mjs";

/**
 * This is the code that decides which version reaches npm. A misclassified
 * commit becomes a published number that cannot be withdrawn, so the rules are
 * pinned here rather than trusted to a read of the regex.
 */

describe("classifyCommit", () => {
  it("maps the conventional types to bump levels", () => {
    expect(classifyCommit("feat: add a tool").level).toBe("minor");
    expect(classifyCommit("fix: stop retrying creates").level).toBe("patch");
    expect(classifyCommit("perf: cache the node route").level).toBe("patch");
    expect(classifyCommit("revert: undo the retry change").level).toBe("patch");
    expect(classifyCommit("docs: rewrite the readme").level).toBe("none");
    expect(classifyCommit("chore: bump deps").level).toBe("none");
    expect(classifyCommit("ci: pin the runner").level).toBe("none");
  });

  it("reads the scope without letting it change the level", () => {
    expect(classifyCommit("fix(ci): run on a newer runtime").level).toBe("patch");
    expect(classifyCommit("feat(server): gate destructive tools").level).toBe("minor");
  });

  it("treats a bang as breaking whatever the type", () => {
    expect(classifyCommit("feat!: drop the legacy aliases").level).toBe("major");
    expect(classifyCommit("fix!: rename the config key").level).toBe("major");
    expect(classifyCommit("chore(deps)!: require node 22").level).toBe("major");
  });

  // The footer is the other half of the spec and the half a subject-only regex
  // misses -- which would publish a breaking change as a patch.
  it("finds BREAKING CHANGE in the footer", () => {
    const message = ["feat: rework the policy engine", "", "Body text here.", "", "BREAKING CHANGE: PVE_ACCESS_TIER is now required."].join("\n");

    expect(classifyCommit(message).level).toBe("major");
    expect(classifyCommit("fix: x\n\nBREAKING-CHANGE: hyphenated spelling is also valid").level).toBe("major");
  });

  it("does not match BREAKING CHANGE mentioned mid-sentence", () => {
    expect(classifyCommit("docs: explain what a BREAKING CHANGE: footer looks like").level).toBe("none");
  });

  // A merge commit's subject describes the merge; its contents are in the log
  // on their own. Counting both would classify the same work twice.
  it("ignores merge commits and unparseable subjects", () => {
    expect(classifyCommit("Merge pull request #5 from NANDI-Services/release").level).toBeNull();
    expect(classifyCommit("Add Code of Conduct for contributors").level).toBeNull();
    expect(classifyCommit("").level).toBeNull();
    expect(classifyCommit(undefined).level).toBeNull();
  });

  it("ignores a type it does not know instead of guessing", () => {
    const result = classifyCommit("wip: half a thought");
    expect(result.level).toBeNull();
    expect(result.reason).toContain("wip");
  });
});

describe("classify", () => {
  it("takes the highest level present", () => {
    expect(classify(["fix: a", "feat: b", "docs: c"]).level).toBe("minor");
    expect(classify(["fix: a", "feat!: b", "feat: c"]).level).toBe("major");
    expect(classify(["fix: a", "fix: b"]).level).toBe("patch");
  });

  it("reports nothing releasable for a docs-only or chore-only push", () => {
    const result = classify(["docs: tidy", "chore: bump deps"]);

    expect(result.level).toBe("none");
    expect(result.releasable).toBe(false);
  });

  // The ignored list is what keeps a skip from being silent: a release that
  // does not happen has to say which commits it looked at.
  it("keeps the ignored commits so a skip can explain itself", () => {
    const result = classify(["feat: a", "Merge pull request #1 from x", "not conventional"]);

    expect(result.considered).toHaveLength(1);
    expect(result.ignored).toHaveLength(2);
    expect(result.releasable).toBe(true);
  });

  it("is not releasable with no commits at all", () => {
    expect(classify([]).releasable).toBe(false);
  });
});

describe("nextVersion", () => {
  // Strict semver was chosen deliberately over the pre-1.0 convention where a
  // breaking change bumps the minor.
  it("bumps strictly, so a breaking change reaches 1.0.0", () => {
    expect(nextVersion("0.3.1", "major")).toBe("1.0.0");
    expect(nextVersion("0.3.1", "minor")).toBe("0.4.0");
    expect(nextVersion("0.3.1", "patch")).toBe("0.3.2");
    expect(nextVersion("0.3.1", "none")).toBe("0.3.1");
  });

  it("resets the lower components", () => {
    expect(nextVersion("1.4.7", "major")).toBe("2.0.0");
    expect(nextVersion("1.4.7", "minor")).toBe("1.5.0");
  });

  it("does not roll a two-digit component over", () => {
    expect(nextVersion("0.9.9", "patch")).toBe("0.9.10");
    expect(nextVersion("0.9.9", "minor")).toBe("0.10.0");
  });

  it("refuses a version it cannot parse rather than inventing one", () => {
    expect(() => nextVersion("not-a-version", "patch")).toThrow(/semver/);
  });
});
