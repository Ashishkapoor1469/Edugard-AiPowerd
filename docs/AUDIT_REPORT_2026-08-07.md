# EduGuard Corrective Audit Report — 2026-08-07

This was a corrective pass only: bug fixes, authorization hardening,
deduplication, loading-state correction, and performance cleanup. No product
feature was added.

## Baseline and build results

- Review base: commit `b44d988`; current starting commit: `2bcaa0c`.
- The recent-change burst contained 52 files and approximately +4,486/-260
  lines, so those files were reviewed first and the active backend/frontend
  trees were then scanned for affected patterns.
- Initial EduGuard backend: success, 0 warnings, 0 errors.
- Initial EduGuard frontend: success with two third-party SignalR annotation
  warnings and a bundle-size warning.
- Initial LMS backend: failed with eight duplicate assembly-attribute errors.
  Cause: the main LMS project compiled generated C# under the nested `Seed/obj`
  project.
- Initial LMS frontend: success.
- Final EduGuard backend: success, 0 warnings, 0 errors.
- Final LMS backend: success, 0 warnings, 0 errors.
- Final EduGuard and LMS frontend builds: success. The only remaining main
  frontend warnings are the two upstream SignalR pure-comment annotations and
  the existing 1.158 MB entry-chunk warning.

## Defects fixed and root causes

### Security and data lifecycle

- Removed the anonymous main `SeedController` and `/api/auth/seed/admin` path.
  Both bypassed the application's real lifecycle; the seed controller could
  erase application data and recreate fixed-password accounts.
- Removed the LMS demo controller, startup demo insertion, read-triggered
  catalog seeding, and direct Mongo seed project/scripts. Reads had hidden write
  side effects and production startup could create demo data.
- Removed degree creation as a side effect of the anonymous degrees read.
- Restricted syllabus AI generation to admin/college-admin authorization.
- Added `scripts/dev-reset-database.js`, which requires an explicit
  `DEV-STAGING` confirmation, verifies exactly one retained super-admin, uses
  `deleteMany` to preserve indexes, and prints post-reset counts.

### Navbar, bottom bar, and role routing

- Sidebar and bottom navigation previously owned separate hardcoded menu lists.
  `frontend/src/navigation.tsx` is now their single role/capability source.
- `BottomNav.tsx` is the sole mobile navigation owner; the desktop sidebar uses
  the same configuration. Safe-area padding prevents the fixed bar from
  covering content.
- Route guards now enforce the same ownership as visible navigation. Students
  only receive their own profile/assignments/report routes; mentor,
  college-admin, librarian, and super-admin shells are separated.
- Librarians are redirected to LMS and no longer receive the main shell.
- Search is limited to mentor/admin/college-admin. Notifications are mentor
  only. The navbar no longer fires search requests for ineligible roles.
- The navbar notification effect was split from route state so navigation no
  longer reconnects SignalR or triggers a duplicate list read.
- Removed the LMS student portal/routes because the established LMS policy is
  college-admin/librarian only; students keep the scoped issued-books view in
  EduGuard.

### Authentication and request clashes

- Replaced stale Axios default-token mutation with one interceptor that reads
  the current token per request.
- Auth bootstrap now runs once. Login/register no longer duplicate `/me` and
  push-registration work. Logout removes EduGuard keys without erasing unrelated
  origin storage.
- Fixed student signup so pre-added students remain unverified until OTP. The
  previous flow allowed login before OTP.
- Signup now validates the pre-added college/roll identity and validates mentor
  approval, college, degree, and capacity for both registration paths.
- LMS SSO/exchange now consistently accepts only college-admin/librarian.
- Report-card generation retains previous reports, is idempotent by request
  key, and uses a polling-specific rate policy. The frontend retains the same
  key across retries.
- Main read rate limits are 30/minute and LMS API limits 120/minute; normal
  page polling no longer collides with write protection.

### Authorization and scope

- Added `IStudentAccessService` as the shared ownership rule: a student can read
  self; an approved assigned mentor can read their student; an active
  college-admin can read their college; an active super-admin can read globally.
- Applied the service to profiles, risk/explanation, recovery plans, badges,
  report jobs, and downloads.
- Added `StudentRosterRules` so attendance and LMS integration use the same
  active-roster predicate.
- Only super-admin can create colleges. College-admin degree, event,
  announcement, librarian, mentor, and student changes are college scoped.
- Mentor assignment validates approved status, college, and degree.
- Assignment creation derives mentor/course/college from JWT; submission derives
  student from JWT; grading/listing validates mentor ownership.
- Chat class, history, and send endpoints enforce student/mentor ownership and
  derive the sender from JWT rather than trusting request payloads.

### Contracts and live-only failures

- LMS catalog search produced `500` for ordinary text because MongoDB rejected
  the combined text/regex OR expression. It now uses escaped case-insensitive
  field matching. The now-unused text-index startup creation was removed, also
  eliminating the index-name/options warning.
- LMS REST book creation correctly returns `201`; the integration harness's
  original `200` expectation was corrected.
- Report job creation correctly returns the existing `200` contract; the
  original harness expectation of `202` was corrected.
- College timezone updates now persist. The final dataset uses `Asia/Kolkata`.

## Consolidations

| Repetition before | Consolidated result | Callers after |
|---|---|---|
| Sidebar and mobile hardcoded role menus | `frontend/src/navigation.tsx` | `Sidebar.tsx`, `BottomNav.tsx`, route shell |
| One-off content placeholders/loaders | `frontend/src/components/ui/Skeleton.tsx` and `AsyncState.tsx` variants | dashboards, tables, lists, cards, profiles |
| Separate LMS placeholders | LMS shared `Skeleton.tsx` and `AsyncState.tsx` | catalog, reports, admin, librarian |
| Repeated student ownership checks | `backend/Services/StudentAccessService.cs` | student profile/risk/badge/report actions |
| Divergent active-roster filters | `backend/Services/StudentRosterRules.cs` | attendance and LMS integration |
| Hardcoded risk condition chain | `backend/Services/RiskScoringRules.cs` | `RiskEngine.cs` |
| Notification trigger condition chain | `backend/Services/NotificationTriggerRules.cs` | `NotificationService.cs` |
| Badge name/type sets | `backend/Services/BadgeCatalog.cs` | badge controller and award worker |
| Per-row assignment submission reads | one batched `$in` query | student assignment list |
| Per-row admin counts | grouped/batched Mongo reads | admin stats and mentor counts |
| Per-import-row ISBN lookup | one existing-ISBN read plus `BulkWrite` | LMS catalog import |

Every new shared abstraction above has at least two consumers or replaces a
multi-branch strategy used by an existing service; no single-caller wrapper was
introduced merely to move code.

## Loading-state audit

| Route/content | Final loading treatment |
|---|---|
| Main dashboards and college-admin dashboard | card/table skeletons |
| Student roster and class overview | table/list skeletons |
| Attendance history/context | table/list skeletons |
| Student profile and report card | profile/card skeletons |
| Assignment list | actual-request card skeleton; no fixed timer |
| Badge gallery | card-grid skeleton |
| Notification list | list-row skeleton |
| Librarian management | table skeleton |
| LMS catalog | card-grid skeleton |
| LMS college-admin/librarian dashboards | cards/tables skeletons |
| LMS reports | table skeleton |
| Login/auth and protected-route transition | full-page spinner |
| Submit, grade, refresh, import, issue, return | button-level spinner/disabled state |
| Finalize Attendance | no loader; constant `Finalize full roster` label |

Fetch errors, including `429`, now remain explicit error states instead of
falling through to empty-state rendering.

## Performance corrections

- Added server-backed 24-item LMS catalog pagination with previous/next
  navigation. Existing large main lists retain their established pagination;
  chat is paged and mentor notifications are deliberately bounded.
- Applied `content-visibility: auto`/intrinsic sizing to long chat,
  notification, catalog, and row/card containers. This provides browser-native
  rendering virtualization without adding another list framework.
- Batched assignment submissions, admin counts, and LMS ISBN import lookups to
  remove N+1 request/query behavior.
- LMS cover images now use lazy loading, asynchronous decoding, and fixed
  dimensions.
- Expensive role/menu derivation and stable callbacks are memoized at the shared
  navigation/list boundaries; unrelated state no longer reconnects SignalR.

## API-driven rebuild evidence

Both Atlas targets were explicitly confirmed as disposable development/staging
databases before deletion. Compressed backups were created and dry-run restored
before reset. The main reset retained only `admin@eduguard.com`; LMS retained no
documents. Collections and indexes were preserved.

The rebuild then created, exclusively through authenticated APIs:

- college `6a75d8f3650fcfd5c4ae9419`
- degree `6a75d8f4650fcfd5c4ae941a`
- college-admin `6a75d8f5650fcfd5c4ae941b`
- mentor `6a75d8f6650fcfd5c4ae941c`
- student `6a75d96363259d1616e586a8`
- assignment `6a75d9f53914a975d7a1b065`
- submission `6a75d9f63914a975d7a1b067`
- LMS book `6a75da9ffb7a905ceb785351`
- returned issuance `6a75db454b69e186505e402e`
- completed report job `6a75dbbe3914a975d7a1b076`

Observed positive statuses included login, creation, approval, signup/OTP,
assignment submit/grade, attendance mark/change/history, LMS SSO/exchange,
catalog add/search, idempotent issue/return, badge generation, notifications,
chat/history, report polling, and HTML/PDF download: all expected `200`/`201`.

Observed negative statuses:

- pre-OTP login `401`
- student admin access `403`
- college-admin mentor notification access `403`
- mentor personal-library access `403`
- student and mentor LMS SSO `403`
- college-admin assignment/catalog mutation `403`
- college-admin chat `403`
- duplicate assignment, attendance finalization, and badge award `409`

The final smoke matrix made 21 successful `200` requests. Ten immediate report
polls all returned `200` with no unintended `429`. Report downloads were nonempty
(HTML 6,326 bytes; PDF 5,298 bytes). Sender-spoof attempts returned identities
from the JWT, and repeating the LMS issue/report idempotency keys returned the
same resource IDs.

The exact repeatable sequence and backup hashes are recorded in
`docs/DEV_DATABASE_RESET_AND_API_REBUILD.md`.

## Visual evidence

- `audit-evidence/navbar-desktop-admin.png`: authenticated 1440×1000
  super-admin shell with the corrected navbar and single desktop navigation.
- `audit-evidence/bottom-nav-mobile-admin.png`: authenticated 390×844 layout
  with the fixed bottom bar visible above the viewport safe area.

## Remaining non-blocking warnings and credential action

- The main frontend still reports two warnings from SignalR's distributed ESM
  comments and the existing large entry chunk. Builds succeed; feature-level
  large collections are paged/contained, but route-level code splitting remains
  a separate bundle-maintenance task and was not expanded into this bug-fix pass.
- Atlas credentials appeared in local diagnostic output during connection
  troubleshooting, and the ignored local credential sheet stores plaintext test
  credentials. Rotate both Atlas database users, update both appsettings files,
  and move secrets to environment variables or .NET user-secrets.
