import { describe, expect, it } from "vitest";

const parseBatchFailure = (stderr: string): string => {
  if (stderr.includes("Permission denied")) {
    return "Check authorized_keys permissions, sshd pubkey settings, and key path.";
  }

  if (stderr.includes("no matching host key")) {
    return "Update host key algorithms or OpenSSH policy to support server keys.";
  }

  return "Run ssh -o BatchMode=yes manually and inspect server-side auth logs.";
};

describe("ssh batch diagnostics", () => {
  it("returns targeted guidance for permission denied", () => {
    const hint = parseBatchFailure("Permission denied (publickey)");
    expect(hint.toLowerCase()).toContain("authorized_keys");
  });
});
