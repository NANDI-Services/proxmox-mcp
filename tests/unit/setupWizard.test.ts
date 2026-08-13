import { describe, expect, it } from "vitest";
import { ask, hasCliOverrides, summarizeProxmoxFailure, type Prompt } from "../../src/cli/setup.js";
import type { RuntimeConfig } from "../../src/config/validate.js";

/**
 * A scripted operator. Records the questions so a test can assert on what was
 * asked, not only on what came out.
 */
const scriptedPrompt = (answers: string[]): Prompt & { asked: string[] } => {
  const asked: string[] = [];
  let index = 0;

  return {
    asked,
    question: async (text: string) => {
      asked.push(text);
      const answer = answers[index];
      index += 1;
      if (answer === undefined) {
        throw new Error(`Wizard asked more questions than the script had answers for: "${text.trim()}"`);
      }
      return answer;
    },
    close: () => undefined
  };
};

const connects = async (): Promise<number> => 3;

// hasToken, tier, host, port, user, realm, tokenName, secret, insecureTls, wantsSsh
const REST_ONLY = ["y", "1", "10.0.0.5", "", "", "", "", "0123456789abcdef", "y", "n"];

describe("hasCliOverrides", () => {
  // Commander fills in defaults for --proxmox-realm and --scope, so a
  // "was anything defined?" test was always true and made the wizard
  // unreachable: a bare `setup` died with "missing required options".
  it("does not treat commander's own defaults as an override", () => {
    expect(hasCliOverrides({ proxmoxRealm: "pve", scope: "project" })).toBe(false);
  });

  it("recognises real connection data", () => {
    expect(hasCliOverrides({ proxmoxRealm: "pve", proxmoxHost: "10.0.0.5" })).toBe(true);
  });
});

describe("ask", () => {
  it("defaults the access tier to the most restricted one", async () => {
    const prompt = scriptedPrompt(["y", "", "10.0.0.5", "", "", "", "", "0123456789abcdef", "y", "n"]);
    const result = await ask({}, { prompt, probe: connects });

    expect(result.accessTier).toBe("read-only");
  });

  it("records the chosen tier", async () => {
    const prompt = scriptedPrompt(["y", "3", "10.0.0.5", "", "", "", "", "0123456789abcdef", "y", "n"]);
    const result = await ask({}, { prompt, probe: connects });

    expect(result.accessTier).toBe("full");
  });

  // Most tools are REST. Forcing everyone through SSH -- the hardest
  // prerequisite -- to reach them was the biggest avoidable blocker.
  it("skips every SSH question when container commands are not needed", async () => {
    const prompt = scriptedPrompt(REST_ONLY);
    const result = await ask({}, { prompt, probe: connects });

    expect(result.config.sshStrategy).toBe("disabled");
    expect(prompt.asked.some((question) => /private key|ssh port|ssh address/i.test(question))).toBe(false);
  });

  it("asks for the key path when container commands are needed", async () => {
    const prompt = scriptedPrompt([
      "y", "1", "10.0.0.5", "", "", "", "", "0123456789abcdef", "n",
      "y", "10.0.0.5", "", "", "/home/me/.ssh/id_ed25519"
    ]);
    const result = await ask({}, { prompt, probe: connects });

    expect(result.config.sshStrategy).toBe("auto");
    expect(result.config.sshKeyPath).toBe("/home/me/.ssh/id_ed25519");
  });

  it("applies the documented defaults when answers are left blank", async () => {
    const prompt = scriptedPrompt(REST_ONLY);
    const { config } = await ask({}, { prompt, probe: connects });

    expect(config.proxmoxPort).toBe(8006);
    expect(config.proxmoxUser).toBe("mcp");
    expect(config.proxmoxRealm).toBe("pve");
    expect(config.tokenName).toBe("nandi");
  });

  // Stopping with an instruction beats collecting ten answers that cannot work.
  it("stops early and points at bootstrap when there is no token yet", async () => {
    const prompt = scriptedPrompt(["n"]);

    await expect(ask({}, { prompt, probe: connects })).rejects.toThrow(/bootstrap/);
  });

  it("does not ask for a tier that was already given on the command line", async () => {
    const prompt = scriptedPrompt(["y", "10.0.0.5", "", "", "", "", "0123456789abcdef", "y", "n"]);
    const result = await ask({ accessTier: "read-execute" }, { prompt, probe: connects });

    expect(result.accessTier).toBe("read-execute");
    expect(prompt.asked.some((question) => /Choose 1-3/.test(question))).toBe(false);
  });

  it("lets a rejected secret be re-entered instead of failing the run", async () => {
    let attempts = 0;
    const probe = async (config: RuntimeConfig): Promise<number> => {
      attempts += 1;
      if (config.tokenSecret !== "the-right-secret") {
        throw new Error("Proxmox request failed with 401");
      }
      return 3;
    };

    // ...then "edit" (2) and the correct secret.
    const prompt = scriptedPrompt([...REST_ONLY, "2", "the-right-secret"]);
    const result = await ask({}, { prompt, probe });

    expect(attempts).toBe(2);
    expect(result.config.tokenSecret).toBe("the-right-secret");
  });

  it("can save an unverified config rather than trapping the operator", async () => {
    const probe = async (): Promise<number> => {
      throw new Error("Proxmox request failed with 401");
    };

    const prompt = scriptedPrompt([...REST_ONLY, "3"]);
    const result = await ask({}, { prompt, probe });

    expect(result.config.proxmoxHost).toBe("10.0.0.5");
  });
});

describe("summarizeProxmoxFailure", () => {
  // A 401 means either a wrong secret or privsep left on, and those need
  // opposite fixes. Naming only the first sends people into a retype loop.
  it("names privilege separation on a 401", () => {
    const summary = summarizeProxmoxFailure(new Error("Proxmox request failed with 401"), "mcp@pve", "nandi");

    expect(summary).toContain("--privsep 0");
    expect(summary).toContain("mcp@pve");
  });

  it("points at the ACL on a 403", () => {
    expect(summarizeProxmoxFailure(new Error("403 Forbidden"), "mcp@pve", "nandi")).toContain("pveum acl modify");
  });

  it("mentions the VPN when the host is unreachable", () => {
    const failure = Object.assign(new Error("nope"), { code: "HOST_UNREACHABLE" });

    expect(summarizeProxmoxFailure(failure, "mcp@pve", "nandi")).toContain("VPN");
  });
});
