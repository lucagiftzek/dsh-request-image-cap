---
name: image-cap-doctor
description: Diagnose dsh-request-image-cap and the provider error "image dimensions exceed max allowed size for many-image requests" step by step. Load it when a long chat with screenshots fails with HTTP 400 on every retry, or when the user asks whether the image cap is active.
---

# image-cap doctor

dsh-request-image-cap shrinks the copy of each image sent to the model so no side exceeds
`maxDimension` (default 2000 px). Stored files are untouched. It has no routes, tools or UI.

## Rules
- Read-only checks first. Never restart `dsh web` yourself (your chat may run inside it).
- Config edits and restarts are [HUMAN] steps: propose the exact change.
- A failing chat does NOT need to be abandoned: once the cap is active, the same chat sends again.

## 0. Facts (read-only)
1. Plugin dir: `node -p "require('path').dirname(require.resolve('dsh-request-image-cap/package.json',{paths:[(process.env.DSH_HOME||require('os').homedir()+'/.dsh')+'/profiles/web']}))"`
   Docs: `<plugin dir>/docs/TROUBLESHOOTING.md`, `docs/ERRORS.md`.
2. `dsh --version`
3. Log: `journalctl -u <your-dsh-unit> --since today | grep request-image-cap | tail -20`
   (ask the human where DSH logs if it is not a systemd unit).
4. Override row: `grep -n -A6 'id: request-image-cap' "${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml"`

## 1. Decision tree
- Error text mentions "many-image requests: 2000 pixels":
  - no `active` line since the last start:
    - entry missing from the composed tree (`dsh --profile web --dump-config | grep request-image-cap`)
      -> not installed or not restarted: TROUBLESHOOTING C1 [HUMAN restart].
    - log shows "maxDimension must be an integer" or "must be booleans" -> bad row value:
      propose the corrected row (entry 3) [HUMAN].
  - `active, N px` with N > 2000 -> propose `maxDimension: 2000` [HUMAN].
  - log shows "readImageRequest is missing" -> plugin inert on this DSH: update needed [HUMAN].
  - `active` at 2000 or lower and still failing -> an image bypasses the attachment seam
    (a tool returning raw base64); identify the message index from the error and its source.
- Different image error (count, bytes, another provider) -> not this plugin: TROUBLESHOOTING entry 5.
- Model cannot read small text -> suggest cropping or splitting tall screenshots (entry 4).

## 2. Report back
The `active` line (or its absence), the branch taken, and the exact change for the human.
