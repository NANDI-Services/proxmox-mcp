const redactionPatterns = [
  /PVEAPIToken=[^\s"]+/gi,
  /Authorization:\s*Bearer\s+[^\s"]+/gi,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /tokenSecret\s*[:=]\s*[^\s,]+/gi,
  /"tokenSecret"\s*:\s*"[^"]+"/gi,
  /"PROXMOX_TOKEN_SECRET"\s*:\s*"[^"]+"/gi,
  /"NANDI_PROXMOX_CONFIG"\s*:\s*"[^"]+"/gi,
  /"password"\s*:\s*"[^"]+"/gi,
  /"cipassword"\s*:\s*"[^"]+"/gi
];

export const redact = (value: string): string => {
  let redacted = value;

  for (const pattern of redactionPatterns) {
    redacted = redacted.replace(pattern, "***REDACTED***");
  }

  return redacted;
};
