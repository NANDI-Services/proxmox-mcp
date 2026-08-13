/**
 * Generates a throwaway self-signed certificate for the fake API.
 *
 * Never commit the output: CI runs gitleaks over the whole repo and a checked-in
 * private key fails the build. Everything lands in a caller-provided directory
 * that is gitignored or a temp dir.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const generateSelfSignedCert = (outputDir) => {
  mkdirSync(outputDir, { recursive: true });

  const certPath = join(outputDir, "server.crt");
  const keyPath = join(outputDir, "server.key");

  if (existsSync(certPath) && existsSync(keyPath)) {
    return { certPath, keyPath, reused: true };
  }

  const result = spawnSync(
    "openssl",
    [
      "req", "-x509",
      "-newkey", "rsa:2048",
      "-nodes",
      "-keyout", keyPath,
      "-out", certPath,
      "-days", "3650",
      "-subj", "/CN=pve-emulator",
      // The IP SAN matters: without it a TLS failure would be an altname
      // mismatch rather than the self-signed-CA rejection we mean to test.
      "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:pve-api"
    ],
    { encoding: "utf8" }
  );

  if (result.error) {
    throw new Error(
      `Could not run openssl to generate the emulator certificate: ${result.error.message}. ` +
        "Install OpenSSL or add it to PATH (Git for Windows ships one)."
    );
  }

  if (result.status !== 0) {
    throw new Error(`openssl failed (exit ${result.status}): ${result.stderr}`);
  }

  return { certPath, keyPath, reused: false };
};

// Allow running directly: node gen-cert.mjs <outputDir>
if (process.argv[1] && process.argv[1].endsWith("gen-cert.mjs")) {
  const target = process.argv[2] ?? join(process.cwd(), ".secrets");
  const generated = generateSelfSignedCert(target);
  console.log(JSON.stringify(generated, null, 2));
}
