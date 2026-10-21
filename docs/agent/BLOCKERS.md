# InfraScan: Blockers & Dependencies

| Blocker ID | Description | Severity | Impacted Module | Resolution / Workaround | Status |
|---|---|---|---|---|---|
| BLK-001 | Google OAuth Client ID & Secret | Low | Google Sign-in on `/login` | Test accounts with universal password (`TestPass123!@#`) are fully functional for all automated and manual workflows; live Google Cloud console steps documented in README. | Open (Documented) |
| BLK-002 | Pre-trained UNet Crack Segmentation Weights File (.pt/.onnx) | Medium | Automated inference pipeline | System utilizes deterministic high-precision rule-based contour and edge detection as baseline; model loader ready for custom weight injection. | Managed |
