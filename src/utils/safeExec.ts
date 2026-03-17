import { spawn } from "node:child_process";

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export const safeExec = async (
  command: string,
  args: string[],
  timeoutMs: number
): Promise<ExecResult> => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";

    const killTimer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(killTimer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      resolve({
        stdout,
        stderr,
        code: code ?? -1
      });
    });
  });
};
