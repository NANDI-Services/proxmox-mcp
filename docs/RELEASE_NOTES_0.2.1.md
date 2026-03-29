# Release Notes 0.2.1

Release date: 2026-03-29

## Highlights
- Published `nandi-proxmox-mcp@0.2.1` to npm.
- Stabilized CI dependency audit policy:
  - Blocking gate for production dependencies only (`npm audit --omit=dev --audit-level=high`).
  - Non-blocking dev dependency audit report uploaded as artifact.
- Improved live validation and endpoint defaults in the Proxmox tool catalog.

## Notes
- This release is focused on release reliability, CI signal quality, and marketplace refresh.
- Core/Advanced capability model and transport compatibility remain unchanged from 0.2.0 architecture.
