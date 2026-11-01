# Changelog

## 0.1.0 (2026-11-01)

First public release.

- Wraps `ctx.attachments.readImageRequest` and turns a per-side pixel cap (`maxDimension`, default 2000) into the area budget DSH's `requestImageDimensions` understands, so many-image Anthropic requests stop failing with "exceed max allowed size for many-image requests: 2000 pixels".
- Retroactive and non-destructive: stored images are untouched, only the request copy shrinks; a tighter route policy is never widened.
- Fails safe when the seam is missing (one warning, no boot failure).
- Troubleshooting guide, error reference and the `image-cap-doctor` skill.
