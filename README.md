# PtsSEND v2 — Pristima Savante SEND Submission Platform

Updated implementation aligned to the **Pristima Savante Functional Design Specification**
(Issue 14, 25 Jul 2023).

## What's New in v2

- **Study model expanded** to match FS14: Savante Study Name, Import Study Name,
  Protocol Status, Savante Status (Setup → DataLoaded → Validated → Approved → Locked),
  Connection Type (CSV / SEND Dataset / Pristima API / OpenVMS), Dataset Approval fields,
  Unique Subject Identifier Flag (FS14.1.9)
- **New: Study Groups (FS15)** — Group Number, Control Type, Male/Female Group Labels
  (GRPLBL for TX domain), Compound, Route, animal counts
- **New: Study Animals (FS16)** — SUBJID with computed USUBJID (respects FS14.1.9 flag),
  Sex, Species, Strain, ARMCD/ARM/SETCD, RFSTDTC
- **New: Controlled Terminology (FS24/FS25)** — Browse CDISC SEND codelists, map source
  values to CT submission values, bulk auto-mapping, Unmapped Term Status (FS44)
- **New: Output Mapping (FS22)** — Required-variable templates for 14 SEND domains
- **Expanded SEND domains (FS27)** — Full 29-domain list with output format selector
  (XPT for FDA submission, CSV/XML for review — FS23)
- **Audit trail with reasons (FS32/FS33)** — Status changes ≥ DataLoaded require an
  audit reason; reasons are stored and displayed in the audit trail
- **Dataset Approval workflow (FS8.2.7/FS14.1.5-8)** — Approve button (gated on
  Closed/Archived protocol status), records approver, comment, timestamp
- **Studies search (FS8.1)** — Wildcard search by name/protocol, status filter,
  connection-type filter

See **CHANGES_FROM_SPEC.md** for the full FS-to-feature mapping and what's deferred
to future phases (the spec is 307 pages — this covers the core study/domain/CT workflow).

## Quick Start (Local)

```bash
cd backend && cp .env.example .env  # if present, else create per render docs
docker compose up --build           # if docker-compose.yml retained from v1
```

## Deploy to Render

Same as v1 — push to GitHub, then Render → New → Blueprint → select repo.
`render.yaml` is pre-configured for free-tier PostgreSQL + Redis + Web services.

## Demo Credentials

```
admin@ptssend.com   / admin123
analyst@ptssend.com / analyst123
```
