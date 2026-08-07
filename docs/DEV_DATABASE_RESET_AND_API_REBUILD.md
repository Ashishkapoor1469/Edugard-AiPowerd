# Development Database Reset and API Rebuild

This procedure is destructive. Use it only after confirming that both MongoDB
targets are disposable development or staging databases. It deliberately keeps
one EduGuard super-admin and removes every other record while preserving
collections and indexes. The LMS database is emptied completely.

Never commit connection strings or account passwords. Supply them through the
shell environment, .NET user-secrets, or an ignored local credential file.

## 1. Back up and validate both databases

1. Read the two configured MongoDB URLs from `backend/appsettings.json` and
   `lms/backend/appsettings.json`. Confirm the database names and Atlas projects
   with the operator before continuing.
2. Create timestamped compressed archives with MongoDB Database Tools:

   ```powershell
   mongodump --uri $env:EDUGUARD_MONGODB_URL --archive=eduguard.archive.gz --gzip
   mongodump --uri $env:EDUGUARD_LMS_MONGODB_URL --archive=eduguard_lms.archive.gz --gzip
   Get-FileHash eduguard.archive.gz -Algorithm SHA256
   Get-FileHash eduguard_lms.archive.gz -Algorithm SHA256
   ```

3. Validate that each archive is readable before resetting:

   ```powershell
   mongorestore --uri $env:EDUGUARD_MONGODB_URL --archive=eduguard.archive.gz --gzip --dryRun
   mongorestore --uri $env:EDUGUARD_LMS_MONGODB_URL --archive=eduguard_lms.archive.gz --gzip --dryRun
   ```

Keep the archives outside the repository. A real restore must target the same
MongoDB server version as the source.

## 2. Reset with the guarded development script

The script refuses to run unless the explicit development/staging confirmation
and mode are present. For the main database it also refuses to continue unless
exactly one matching super-admin already exists.

```powershell
$env:EDUGUARD_RESET_CONFIRM = 'DEV-STAGING'
$env:EDUGUARD_RESET_MODE = 'main'
$env:EDUGUARD_RETAIN_ADMIN_EMAIL = 'admin@eduguard.com'
mongosh $env:EDUGUARD_MONGODB_URL --file scripts/dev-reset-database.js

$env:EDUGUARD_RESET_MODE = 'lms'
mongosh $env:EDUGUARD_LMS_MONGODB_URL --file scripts/dev-reset-database.js
```

Review the JSON count map printed after each run. Main must contain only the
retained super-admin; LMS must contain zero documents. Do not use an HTTP seed
endpoint and do not insert reconstruction data directly into MongoDB.

## 3. Rebuild exclusively through application APIs

Start both APIs, then perform the following order. Replace `{id}` placeholders
with IDs returned by the preceding call. All bearer tokens must come from real
login or SSO responses.

| Order | Actor | Request | Expected result |
|---:|---|---|---|
| 1 | super-admin | `POST /api/auth/login` | `200`, admin JWT |
| 2 | super-admin | `POST /api/admin/colleges` | `200`, college ID |
| 3 | super-admin | `POST /api/admin/degrees` | `200`, degree ID |
| 4 | super-admin | `POST /api/admin/college-admins` | `201`, college-admin ID |
| 5 | college-admin | `POST /api/auth/login` | `200`, scoped JWT |
| 6 | mentor | `POST /api/auth/register` | `201`, pending mentor ID |
| 7 | college-admin | `GET /api/admin/mentors/pending`, then `POST /api/admin/mentors/{id}/status` | `200`, approved |
| 8 | mentor | `POST /api/auth/login` | `200`, mentor JWT |
| 9 | college-admin | `POST /api/admin/students` | `200`, pre-added student |
| 10 | student | `POST /api/auth/student/signup` | `200`, OTP dispatched by the configured development mail sender |
| 11 | student | `POST /api/auth/student/verify-otp` | `200`, verified student ID |
| 12 | student | `POST /api/auth/login` | `200`, student JWT |
| 13 | mentor | `POST /api/students/{id}/verify` | `200`, active student |
| 14 | mentor | `POST /api/students/assignments` | `200`, assignment ID |
| 15 | student | `POST /api/students/assignments/{id}/submit` | `200`, submission ID |
| 16 | mentor | `POST /api/students/submissions/{id}/grade` | `200` |
| 17 | college-admin | `POST /api/integrations/lms/colleges/{collegeId}/librarians` | `200`, librarian identity |
| 18 | college-admin or librarian | `POST /api/auth/lms-sso`, then LMS `POST /api/auth/exchange` | `200`, LMS JWT |
| 19 | librarian | LMS `POST /api/catalog` | `201`, book ID |
| 20 | librarian | LMS `GET /api/students/search-eduguard`, then `POST /api/students/{studentId}` | `200`, LMS student registration |
| 21 | librarian | LMS `POST /api/circulation/issue` with `Idempotency-Key` | `200`, issuance ID |
| 22 | librarian | LMS `POST /api/circulation/{issuanceId}/return` | `200` |
| 23 | mentor/CR | `GET /api/attendance/context`, then `POST /api/attendance/mark` | `200`, finalized roster |
| 24 | mentor | `POST /api/students/{id}/badges` when a manual award is needed | `200`; duplicate is `409` |
| 25 | mentor and student | `POST /api/chat/send`, then `GET /api/chat/{studentId}` | `200`; sender comes from JWT |
| 26 | mentor | `POST /api/students/{id}/report-card/generate` with `Idempotency-Key` | `200`, job ID |
| 27 | authorized owner | Poll `GET /api/students/report-card/jobs/{jobId}` | `200` until completed |
| 28 | authorized owner | Download HTML and PDF report-card endpoints | `200` with non-empty bodies |

After every creation step, exercise the corresponding read endpoint before
moving on. Retry idempotent calls with the same key and verify that the returned
resource ID is unchanged. A failed step is an application defect; do not bypass
it with a database insert.

## 4. Required negative checks

- Student cannot log in before OTP verification (`401`).
- Student cannot call admin endpoints (`403`).
- College-admin cannot use mentor-only notifications or assignment creation
  (`403`).
- Mentor cannot use the student's personal library endpoint (`403`).
- Student and mentor cannot obtain LMS SSO tokens (`403`).
- College-admin cannot mutate catalog records reserved for librarians (`403`).
- Duplicate assignment submission, attendance finalization, and manual badge
  award return `409`.
- Chat request bodies cannot spoof a sender; returned sender identity must match
  the JWT.
- Failed and `429` reads must render an error state, never an empty-data state.

## 5. Audit run recorded on 2026-08-07

The audited development run created one college, degree, college-admin, mentor,
student, librarian, assignment/submission, attendance record, LMS book/issuance,
badges, notifications, chat history, and report-card job using only the calls
above. The chain completed end-to-end. Twenty-one final smoke requests returned
`200`; ten rapid report-job polls also returned `200` without a rate-limit clash.

The verified backup artifacts were stored outside the repository at
`C:\tmp\eduguard-db-backups\20260807-181952`. Their SHA-256 values were:

- EduGuard: `5106A6BEA5CB3A33B718BB5C84EB18D9FE7E0DE104F38C9B84CEE0B905C5D742`
- LMS: `2D024F86C76B032B796A59C01A7DC29C74B9927677903DAF0E22A83FFF21B335`
