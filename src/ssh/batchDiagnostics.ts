import type { SshBatchOptions } from "./sshClient.js";
import { runSshBatch } from "./sshClient.js";

export type SshBatchDiagnostic = {
  check: string;
  ok: boolean;
  detail: string;
};

export const diagnoseBatchOnlyFailure = async (options: SshBatchOptions): Promise<SshBatchDiagnostic[]> => {
  const checks: Array<{ name: string; command: string; failHint: string }> = [
    {
      name: "batch_echo",
      command: "echo batch-ok",
      failHint: "Batch SSH command failed. Check key auth and allowed command execution."
    },
    {
      name: "authorized_keys_permissions",
      command: "stat -c '%a %n' ~/.ssh ~/.ssh/authorized_keys",
      failHint: "Invalid ~/.ssh or authorized_keys permissions can break batch mode."
    },
    {
      name: "shell",
      command: "getent passwd $USER | cut -d: -f7",
      failHint: "Login shell may be restricted (for example nologin) for non-interactive SSH."
    },
    {
      name: "sshd_batch_related",
      command: "sudo sshd -T | egrep 'pubkeyauthentication|passwordauthentication|permitrootlogin|authorizedkeysfile'",
      failHint: "Inspect sshd effective config for key auth and authorized keys file path."
    }
  ];

  const diagnostics: SshBatchDiagnostic[] = [];

  for (const check of checks) {
    const res = await runSshBatch(options, check.command);
    diagnostics.push({
      check: check.name,
      ok: res.exitCode === 0,
      detail: res.exitCode === 0 ? res.stdout.trim() || "ok" : `${check.failHint} stderr=${res.stderr.trim()}`
    });
  }

  return diagnostics;
};
