const redactionPatterns = [
  /PVEAPIToken=[^\s"]+/gi,
  /tokenSecret\s*[:=]\s*[^\s,]+/gi,
  /"tokenSecret"\s*:\s*"[^"]+"/gi
];

export const redact = (value: string): string => {
  let redacted = value;

  for (const pattern of redactionPatterns) {
    redacted = redacted.replace(pattern, "***REDACTED***");
  }

  return redacted;
};
