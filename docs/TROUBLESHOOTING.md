# Troubleshooting dsh-request-image-cap

Checked on: DSH 0.1.5-rc.1 (the request seam also exists on 0.2.1-rc.5), plugin 0.1.0.

<a id="start-here"></a>
**Start here.** Ask your agent to load the `image-cap-doctor` skill (copy it into
`~/.dsh/skills/` first, see [the skill section](#skill)), or follow section 0. The plugin has
no routes, tools or UI; its state is visible in the DSH log. Messages and their meaning:
[ERRORS.md](ERRORS.md).

## Quick index

| # | Symptom (what you see) | Most likely cause | Jump |
|---|---|---|---|
| 1 | A long chat fails with HTTP 400 "image dimensions exceed max allowed size for many-image requests: 2000 pixels", on every retry | plugin not active, or cap above 2000 | [1](#t-400-many-image) |
| 2 | DSH logs "readImageRequest is missing", images go out uncapped | DSH update renamed the seam | [2](#t-seam-missing) |
| 3 | The plugin entry fails at start with "maxDimension must be an integer ..." | config value of the wrong type | [3](#t-bad-config) |
| 4 | The model says screenshots are too small or blurry to read | cap too low for the content | [4](#t-blurry) |
| 5 | Other image errors (too many images, image too large in bytes, other providers) | a different limit, not this plugin's | [5](#t-other-limits) |

## 0. Collect facts (read-only, always safe)

```bash
dsh --version
D="${DSH_HOME:-$HOME/.dsh}/profiles/web"
node -e 'const p=require(process.argv[1]);console.log((p.dsh?.profile?.bundles||[]).filter(b=>/image-cap/.test(b)))' "$D/package.json"
grep -n -A6 'id: request-image-cap' "$D/cordis.patch.yml"      # profile override row, if any
journalctl -u <your-dsh-unit> --since today | grep 'request-image-cap' | tail -20
```

Healthy: `request-image-cap: active, 2000px per side` once per DSH start. With
`verbose: true`, one line per clamped image: `request-image-cap: 828x5059 -> pixel budget ...`.

<a id="t-400-many-image"></a>
## 1. HTTP 400 "image dimensions exceed max allowed size for many-image requests"

Anthropic's Messages API accepts larger images in a short request but only 2000 px per side
once a request carries many images. DSH limits images by AREA, so a tall full-page screenshot
passes DSH's gate and is sent at full height. The failure appears late in a long session and
then repeats on every retry, because the image is already in the history.

**Likely causes**
1. The plugin is not mounted or not restarted since install (no `active` line, see C1).
2. `enabled: false`, or `maxDimension` set above 2000 in the profile row.
3. The seam was renamed by a DSH update ([2](#t-seam-missing)).
4. The image reaches the provider through a path that does not use the attachment seam (for
   example a tool result that embeds raw base64 itself).

**Diagnose:** section 0. `active` line present with a value at or under 2000 and the error
persists = cause 4: note which message index the error names and look at that message's source.

**Fix**
- Causes 1 and 2: install/enable, cap 2000 or lower, restart `dsh web` **[HUMAN]**. The plugin
  acts at request time, so the SAME chat becomes sendable again: no need to start over.
- Cause 4: report it to the tool's author; meanwhile avoid that tool in long chats.

**Verify:** retry the failed turn; with `verbose: true` the log shows the clamp line.

<a id="t-seam-missing"></a>
## 2. "attachments.readImageRequest is missing, images are transmitted uncapped"

The plugin wraps `ctx.attachments.readImageRequest`. If a DSH update renames or moves it, the
plugin logs this warning and stays inert on purpose (it never blocks the boot).
**Fix:** update the plugin to a version that supports your DSH line. Until then, long
image-heavy chats can hit [1](#t-400-many-image) again.

<a id="t-bad-config"></a>
## 3. Entry fails with "maxDimension must be an integer from 64 through 8192" (or "enabled and verbose must be booleans")

**Cause:** a quoted value in YAML (`maxDimension: "2000"`), a float, or a value out of range.
**Fix:** unquoted integer 64..8192, booleans unquoted:
```yaml
- id: request-image-cap
  config:
    enabled: true
    maxDimension: 2000
    verbose: false
```
**Verify:** the `active` line shows the value after the next start (or live reload of the
profile patch).

<a id="t-blurry"></a>
## 4. The model cannot read small text in screenshots

The cap shrinks only the copy sent to the model (stored files are untouched), keeping the
aspect ratio: a very tall page at 2000 px height becomes narrow. **Fix:** crop or split tall
screenshots before attaching them, rather than raising the cap above the provider's limit.

<a id="t-other-limits"></a>
## 5. Other image errors

This plugin enforces ONE rule: pixels per side. It does not change the number of images per
request, the byte size per image, or limits of other providers. Read the provider's error
text: count limits need fewer images in the context (compact or start a new chat), byte
limits need DSH's own attachment settings.

<a id="skill"></a>
## The doctor skill

This version does not register its skill automatically; copy it once:
```bash
P=$(node -p "require('path').dirname(require.resolve('dsh-request-image-cap/package.json',{paths:[(process.env.DSH_HOME||require('os').homedir()+'/.dsh')+'/profiles/web']}))")
mkdir -p "${DSH_HOME:-$HOME/.dsh}/skills" && cp -r "$P/skills/image-cap-doctor" "${DSH_HOME:-$HOME/.dsh}/skills/"
```

<!-- dsh-common-install:v1 -->
## Common install problems on DSH

Placeholders: `DSH_HOME` defaults to `~/.dsh`, the profile is `web`. Items that cannot apply
to this plugin (routes, UI, webhooks, media) are left out; numbering follows the shared standard.

<a id="c1-not-loaded"></a>
### C1. The plugin does not appear at all (no `active` line)

**Causes:** (1) installed but not in the profile's bundle list; (2) in the list but `dsh web`
not restarted; (3) DSH refused it as incompatible (engines or peer range); (4) its entry
threw at start (see [3](#t-bad-config)).

**Diagnose**
```bash
D="${DSH_HOME:-$HOME/.dsh}/profiles/web"
node -e 'const p=require(process.argv[1]);console.log((p.dsh?.profile?.bundles||[]).join("\n"))' "$D/package.json" | grep -n 'dsh-request-image-cap' || echo "NOT IN BUNDLES"
ls -la "$D/node_modules/dsh-request-image-cap" 2>/dev/null || echo "NOT INSTALLED"
dsh --profile web --dump-config 2>/dev/null | grep -n 'request-image-cap' | head    # composed tree, does not boot
journalctl -u <your-dsh-unit> --since "1 hour ago" | grep -i -E 'image-cap|incompatible|skipped|exemption|duplicate loader entry' | tail -40
```

**Fix:** `dsh plugin --profile web add <package-or-path>` (adds it to `dsh.profile.bundles`
because the package declares `dsh.bundle`), then restart `dsh web` **[HUMAN if your chat runs
inside dsh web]**. The package's own patch inserts the entry: do not add a second `insert`
row by hand (DSH reports `duplicate loader entry id`); use a plain `- id: request-image-cap`
row with `config:` to override values. If the log says the bundle was skipped as
incompatible, update the plugin; DSH 0.2.x also offers an exact-version exemption
(`dsh plugin allow-version`, see the log message), granted again after every DSH version change.

<a id="c3-settings-not-saved"></a>
### C3. Settings do not apply

There is no settings form on either DSH line: values come from the package patch, overridden
by a `- id: request-image-cap` row in your profile's `cordis.patch.yml`. A section in
`settings.yaml` is not read. Back up the file before editing it.

<a id="c6-oom-install"></a>
### C6. The machine runs out of memory during an install

A profile-level `pnpm install` can grow to many GB on a large profile; with swap full, the
kernel or earlyoom kills unrelated services. Check `free -m`, then:
```bash
systemd-run --user --scope -p MemoryMax=3G dsh plugin --profile web add <package-or-path>
```
<!-- /dsh-common-install -->
