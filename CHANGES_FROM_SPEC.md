# Changes from Pristima Savante Functional Specification (v14, 25-Jul-2023)

This v2 update maps the application to the screen-wise functional specification.
Below is a mapping of FS sections to implemented features.

## Implemented

| FS Section | Feature | Where |
|---|---|---|
| FS8 — Studies | Wildcard search by name/protocol, status filter, connection-type filter | `StudiesPage.tsx`, `studies.py` |
| FS8.2.5 | Audit-reason-required delete for loaded studies | `studies.py` delete endpoint |
| FS8.2.7 | Approve Dataset (requires Closed/Archived protocol status) | `reports.py` `/approve`, `ReportTab` |
| FS14 — Study Definition | Savante Study Name, Import Study Name, Protocol Status, Savante Status, Connection Type, SENDIG version | `Study` model, `StudyTab` |
| FS14.1.5–8 | Dataset Approved flag/by/comment/date | `Study` model fields |
| FS14.1.9 | Unique Subject Identifier Flag → USUBJID computation (`SUBJID` vs `STUDYID-SUBJID`) | `studies.py` `create_animal` |
| FS14.2.1 | Audit-reason-required save when status ≥ DataLoaded | `studies.py` update endpoint |
| FS15 — Group | Group Number, Control Type, Male/Female Group Label (GRPLBL), Compound, Route, counts | `StudyGroup` model, `GroupsTab` |
| FS16 — Animal | SUBJID, computed USUBJID, Sex, Species, Strain, ARMCD/ARM/SETCD, RFSTDTC | `StudyAnimal` model, `AnimalsTab` |
| FS22 — Output Mapping | Required-variable templates per domain (DM, BW, LB, CL, MI, MA, OM, TS, TE, TA, TX, DS, EX, FW, BG) | `output_mapping.py` |
| FS23 — SEND Output Generate | Output format selector: XPT / CSV / XML | `TransformTab`, `transformation.py` |
| FS24/FS25 — Controlled Terminology | CDISC SEND codelists (SEX, SPECIES, STRAIN, ROUTE, SEVERITY, units, ARMCD), mapping table, bulk auto-map | `ct.py`, `CTPage.tsx`, `CTTab` |
| FS27 — SEND Domains | Full 29-domain list (TS, TE, SE, TA, TX, DM, BW, MI, SC, DS, DD, MA, TF, BG, OM, CL, FW, PM, LB, EX, VS, EG, RE, CV, IC, FM, PY, FX, DP) | `transformation.py` `/domains` |
| FS29 — Define.xml | Generation stub via Celery task | `reports.py`, `tasks.py` |
| FS32 — Audit Trail | Per-study, per-action audit log with reason field (21 CFR Part 11) | `AuditLog` model, `ReportTab` |
| FS44 — Unmapped Term Status | CT mapping filter by status (Unmapped/Mapped/Suppressed) | `CTTab` |

## Not Yet Implemented (large appendices — flag for next phase)

- FS7 — full Connection Setup screen (Pristima API / OpenVMS / SEND Dataset connector configuration UI)
- FS12/FS13 — New Study popup + Select Measurements/Files multi-step wizard
- FS17–FS21 — Trial Summary, Trial Element, Trial Arm, Trial Set, Trial Set Parameter screens
- FS26 — Additional Measurement Data loading
- FS28 — Logging screen
- FS30/FS31 — Study Design + Special Algorithms (dosing calculations, terminal body weight, etc.)
- FS33 — Reason Selection popup (currently a simple browser `prompt()`, not a full reason-code picker)
- FS35 — Deployment / DB switching / fresh-install sequence
- FS36–FS40 — Dosing specifications, Edit View Data, System Migration, SEND Output Configuration
- FS41/FS42 — External Views & Savante API
- FS43 — Formatted Reports (RTF/PDF)
- FS45–FS51 — TUMOR.XPT, DART studies, Phase setup, Relevant Finding Data, Non-SEND domains, GenTox, Pristima Summary Reports
- Appendices A–O — 2FA, Study Merge, License/Privileges, Migration error handling, etc.

These represent the majority of the 307-page spec and would require dedicated follow-up
phases. The current update focuses on the core study/group/animal/domain/CT/output workflow
(FS8, FS14–FS16, FS22–FS25, FS27, FS29, FS32) as the foundation.
