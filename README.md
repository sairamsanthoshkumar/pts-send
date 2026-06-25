# FS8 Studies Page Update

## File to replace in your repo:
  frontend/src/pages/StudiesPage.tsx  →  frontend/src/pages/StudiesPage.tsx

## Push to GitHub:
  git add frontend/src/pages/StudiesPage.tsx
  git commit -m "FS8: Studies list page matching Savante design"
  git push origin master

## What's implemented:
  FS8.1.1  Study Name wildcard search (matches Savante Study Name + Original Study Name)
  FS8.1.2  Status multi-select filter (Done, In Progress, Failed, Aborted, Queued)
  FS8.1.3  Job Created From date filter
  FS8.1.4  Job Created To date filter
  FS8.1.5  Latest 10 Job Created checkbox
  FS8.1.6  Source Type connector selector (Pristima API / CSV / SEND Dataset / OpenVMS)
  FS8.1.7  Row checkboxes + select all header checkbox
  FS8.1.8  Show Individual Jobs checkbox
  FS8.1.9  Download column (Define.xml / Validation Report / Output Log links)
  FS8.2.1  Search button with all filters applied together
  FS8.2.2  Edit Study — single selection enforced, navigates to study detail
  FS8.2.3  Additional Measurement Data — single selection, navigates to ingest tab
  FS8.2.4  Abort Load — only aborts "In Progress" jobs, shows error if none
  FS8.2.5  Delete — audit reason popup for studies requiring audit trail
  FS8.2.6  Edit/View Data — single selection, navigates to transformation tab
  FS8.2.7  Approve Dataset — gated on Closed/Archived protocol status, approval popup
  FS8.2.8  Output Jobs Only toggle button
  Grid     Original Study Name | Savante Study Name | Measurements | Job Created | Status | Download | Type
           Rows alternate color, selected rows highlighted blue
           Clickable study name links navigate to study detail
