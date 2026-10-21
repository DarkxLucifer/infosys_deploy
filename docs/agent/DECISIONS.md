# InfraScan: Key Decisions & Architecture Choices

| Date | ID | Decision | Rationale | Context / Scope |
|---|---|---|---|---|
| 2026-10-21 | DEC-001 | Hybrid Session Model: In-memory JWT + HttpOnly refresh cookie | Eliminates XSS token theft via `localStorage` while maintaining instant client-side authorization headers and secure session restoration. | Auth & Session Management (§2) |
| 2026-10-21 | DEC-002 | Rule 0.1 Strict Zero Mock Data | All frontend cards and charts must bind directly to live SQLite / PostgreSQL endpoints to prevent illusory test passes and guarantee real-world reliability. | Entire Frontend & API Architecture |
| 2026-10-21 | DEC-003 | Human-in-the-Loop AI Gating | Machine learning detections are strictly advisory (decision support). Inspection findings remain in `pending_review` until certified by a licensed Civil Engineer. Mandatory disclaimer shown on all pages. | Compliance & Regulatory Safety (§1) |
| 2026-10-21 | DEC-004 | Dual Calibration Unit Standard | Crack lengths and widths default to pixels with `(uncalibrated)` flag unless an explicit mm-per-pixel calibration is certified with physical uncertainty calculation. | Measurement Engine (§1, §9) |
| 2026-10-21 | DEC-005 | Preprocessing Pipeline Versioning | All image enhancements (CLAHE, sharpening, noise removal) persist their parameter dictionary and `pipeline_version` to guarantee deterministic audit reproducibility. | Preprocessing & Forensics (§6) |
