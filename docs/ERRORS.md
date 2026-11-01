# Error codes: dsh-request-image-cap

This plugin returns no errors to tools or HTTP clients: it only rewrites the image budget of
model requests. Its reserved prefix for future codes is `IMAGECAP_`. What you meet are the
provider error it prevents and its own log lines.

| Message | Where it appears | Meaning | Agent action |
|---|---|---|---|
| `At least one of the image dimensions exceed max allowed size for many-image requests: 2000 pixels` | model turn fails, HTTP 400 from the provider | an image in the context is taller or wider than 2000 px in a many-image request | check the plugin is active ([details](#many-image-400)) |
| `request-image-cap: active, <N>px per side` | DSH log, once per start | plugin mounted with cap N | none ([details](#log-active)) |
| `request-image-cap: attachments.readImageRequest is missing ...` | DSH log warning | seam not found, plugin inert | tell the human to update the plugin ([details](#log-seam-missing)) |
| `request-image-cap: maxDimension must be an integer from 64 through 8192` | DSH log, entry failed at start | bad config value | fix the row ([details](#log-bad-config)) |
| `request-image-cap: enabled and verbose must be booleans` | DSH log, entry failed at start | bad config value | fix the row ([details](#log-bad-config)) |

<a id="many-image-400"></a>
### Provider 400: many-image dimension limit
- **Meaning:** the provider refuses the whole request; it repeats on every retry because the
  image stays in the history.
- **Agent action:** run TROUBLESHOOTING section 0; if the plugin is active at 2000 or lower,
  look for an image that bypasses the attachment seam.
- **Needs the human:** to install/enable the plugin or restart `dsh web`.
- **Troubleshooting:** [entry 1](TROUBLESHOOTING.md#t-400-many-image)

<a id="log-active"></a>
### Log: `request-image-cap: active`
- **Meaning:** the cap is installed for this run of DSH.

<a id="log-seam-missing"></a>
### Log: `readImageRequest is missing`
- **Meaning:** the running DSH has no `attachments.readImageRequest`; the plugin does nothing.
- **Needs the human:** yes, update the plugin. [Entry 2](TROUBLESHOOTING.md#t-seam-missing).

<a id="log-bad-config"></a>
### Log: config validation messages
- **Meaning:** the entry config failed validation and the entry did not mount.
- **Agent action:** show the human the exact row to change (unquoted integer 64..8192,
  unquoted booleans). [Entry 3](TROUBLESHOOTING.md#t-bad-config).
