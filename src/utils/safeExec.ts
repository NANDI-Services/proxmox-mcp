import { spawn } from "node:child_process";

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export const safeExec = async (
  command: string,
  args: string[],
  timeoutMs: number,
  maxOutputBytes = 1024 * 1024
): Promise<ExecResult> => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    const terminateForOutputOverflow = (): void => {
      child.kill();
      settle(() => reject(new Error(`Command output exceeded limit for ${command}`)));
    };

    const killTimer = setTimeout(() => {
      child.kill();
      settle(() => reject(new Error(`Command timed out: ${command}`)));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      outputBytes += Buffer.byteLength(text, "utf8");
      if (outputBytes > maxOutputBytes) {
        terminateForOutputOverflow();
        return;
      }
      stdout += text;
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      outputBytes += Buffer.byteLength(text, "utf8");
      if (outputBytes > maxOutputBytes) {
        terminateForOutputOverflow();
        return;
      }
      stderr += text;
    });

    child.on("error", (error) => {
      clearTimeout(killTimer);
      settle(() => reject(error));
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      settle(() =>
        resolve({
          stdout,
          stderr,
          code: code ?? -1
        })
      );
    });
  });
};
