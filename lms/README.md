# EduGuard Library Management System

The LMS is a completely separate application kept under `lms/` so it can be deployed and scaled independently while its integration contract stays versioned with EduGuard.

```text
lms/
  backend/     ASP.NET Core 8 API, MongoDB repositories, transactions, worker
  frontend/    independent React/Vite web application
```

EduGuard only owns identity, SSO, device tokens, and push dispatch. The LMS owns books, circulation, reservations, fines, settings, reports, and audits in a separate MongoDB database. LMS code is not mixed into EduGuard's backend or frontend.

## Integration

```text
EduGuard UI -> EduGuard API -> five-minute SSO handoff -> LMS UI/API
EduGuard Books tab -> ILibraryService HTTP adapter -> LMS API
LMS API -> service-key identity checks -> EduGuard API
LMS worker -> service-key/idempotent push jobs -> EduGuard push queue -> FCM
```

EduGuard creates a short SSO token, the LMS validates it back-channel through EduGuard, then creates an eight-hour LMS-only session signed by `LMS_JWT_SECRET`. Librarians can also sign in on the LMS using the college-scoped EduGuard identity created by their college administrator; credentials are verified by EduGuard and are not copied into the LMS database. `LMS_SERVICE_KEY` must be the same strong value in both backend deployments. Production secrets must be environment variables, never committed settings.

The active configuration uses `https://edugard-aipowerd-1.onrender.com` for the LMS API, `https://edugard-aipowerd.onrender.com` for the EduGuard API, `https://edugard-ai-powerd.vercel.app` for returning to EduGuard, and `https://edugard-ai-powerd-swsb.vercel.app` for the LMS frontend.

## Features

- Catalog title, author, ISBN, category, copy counts, shelf, cover URL, create/edit, Excel import, text search, category and availability filters.
- Transactional issue/return, one renewal, reservations/holds, overdue tracking, and configurable loan rules.
- Default maximum two active books with per-degree overrides. Unique active slots enforce the limit even under concurrent requests.
- Configurable daily fines, recorded payments and waivers, and full action audits.
- Most-borrowed, overdue, overall, and per-class usage reporting.
- Student catalog/reservations and issued-book view; librarian desk/dashboard; college-admin settings, reports, and librarian management.
- Librarian notification preferences using EduGuard's existing notification settings and device-token system.

Excel headers are `Title`, `Author`, `ISBN`, `Category`, `Total Copies`, `Shelf Location`, and `Cover Image`.

## Scale and correctness

Issue and return use MongoDB transactions, so production MongoDB must be an Atlas/replica-set deployment. Issue, return, renew, and reserve require `Idempotency-Key`. Unique indexes cover college ISBN, issue/reservation keys, active student slots, student/status, book/status, and due dates. Fines are recalculated deterministically through a date; reservation claims are atomic; push jobs use event/date keys. Multiple API and worker instances therefore do not double-decrement, exceed student limits, double-charge, or double-send.

Catalog responses use a 30-second distributed cache. Mutations increment a college catalog version to invalidate old keys. Redis is recommended for multiple instances; memory cache is development-only. Catalog requests are rate-limited per authenticated user.

Start with MongoDB's scoped text index for a normal college catalog. Replace only the repository search implementation with Atlas Search when measured scale needs fuzzy matching, autocomplete, multilingual analyzers, or better relevance/latency.

## Daily notifications

The hourly idempotent worker performs date-based checks for due-soon/due-today reminders, overdue fines and student alerts, librarian overdue digests, fine-threshold alerts, reservation-ready alerts to student and librarian, expired holds, and high-demand zero-stock alerts. Overdue past the configured threshold and high-demand unavailable titles are `important`; other messages are `normal`. Deep links are included in push data.

## Authorization

All data access is college-scoped. Students can only read their own issuances/fines and manage their own reservations. Librarian/college-admin writes are role-restricted server-side. Student state and scope are revalidated through EduGuard on circulation writes. Librarian creation/status changes are also reauthorized by EduGuard. Catalog, circulation, settings, payment, and waiver actions are audited.

## Configuration

Use `backend/appsettings.example.json` and `frontend/.env.example` as variable lists. Required backend values are `LMS_MONGO_URI`, `LMS_JWT_SECRET`, `LMS_SERVICE_KEY`, `EDUGUARD_API_URL`, and `LMS_FRONTEND_URL`; `REDIS_URL` is recommended. Frontend builds require `VITE_LMS_API_URL` and `VITE_EDUGUARD_URL`.

EduGuard needs the same `LMS_SERVICE_KEY`, plus `LMS_API_URL`, `LMS_FRONTEND_URL`, and `LMS_INTEGRATION_ENABLED`.

## Rollout

1. Deploy the separate LMS database/API/UI with `LMS_INTEGRATION_ENABLED=false` in EduGuard.
2. Pilot catalog import and issue/return. Import catalog books first, then migrate active `Student.IssuedBooks` records, preserving issue/due dates and assigning active slots. Reconcile active and available counts.
3. Set EduGuard `LMS_INTEGRATION_ENABLED=true`. Its unchanged V3 Books tab now reads the LMS through the existing interface. Set it false to roll back during the migration window.
4. Enable reservations/renewals, then fines/payment records, then notifications/preferences and reports after observing a complete job cycle.
5. Retire embedded records only after reconciliation and a rollback window.

This is additive: V1/V2 routes and screens are unchanged, and V3 keeps the same `GetIssuedBooks`, `IssueBook`, and `ReturnBook` contract.

## Build and deploy

The backend has a Render Dockerfile. The frontend deploys directly to Vercel with Vite and SPA rewrites.

```powershell
dotnet build lms/backend/Lms.Api.csproj
npm run build --prefix lms/frontend
dotnet build backend/backend.csproj -o C:\tmp\eduguard-backend-build
npm run build --prefix frontend
```

Use LMS API `/health` for deployment checks. Pass frontend URLs as build arguments and backend secrets only as runtime environment variables.

### Render backend

Create a Docker web service with repository root directory `lms/backend`, Dockerfile `./Dockerfile`, and health path `/health`. Set `LMS_MONGO_URI`, `LMS_JWT_SECRET`, `LMS_SERVICE_KEY`, `EDUGUARD_API_URL`, `LMS_FRONTEND_URL`, and optionally `REDIS_URL`; Render supplies `PORT`.

### Vercel frontend

Import the same repository with root directory `lms/frontend` and Vite preset. Set `VITE_LMS_API_URL` to the Render LMS URL and `VITE_EDUGUARD_URL` to the EduGuard frontend URL. `vercel.json` handles SPA routes.

Finally set `LMS_API_URL`, `LMS_FRONTEND_URL`, and the matching `LMS_SERVICE_KEY` in the EduGuard Render service. Keep `LMS_INTEGRATION_ENABLED=false` until data migration is reconciled, then change it to `true`.
