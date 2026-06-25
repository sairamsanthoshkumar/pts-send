# FS5 + FS7 Update

## Backend — 3 files to update
backend/app/api/v1/endpoints/auth.py       → replace
backend/app/api/v1/endpoints/connection.py → NEW FILE
backend/app/api/v1/router.py               → replace

## Frontend — 6 files to update
frontend/src/App.tsx                             → replace
frontend/src/store/authStore.ts                  → replace
frontend/src/pages/LoginPage.tsx                 → replace
frontend/src/pages/ConnectionPage.tsx            → NEW FILE
frontend/src/components/common/Layout.tsx        → replace
frontend/src/components/common/TopNav.tsx        → NEW FILE

## Push to GitHub
git add .
git commit -m "FS5+FS7: login fields, Savante nav, connection setup page"
git push origin master

## New login: use username (not email)
admin / admin123   or   analyst / analyst123
