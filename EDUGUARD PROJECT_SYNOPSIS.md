<style>
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
html, body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
h1 { font-size: 24pt; text-align: center; margin: 0 0 24pt; }
h2 { font-size: 17pt; margin-top: 20pt; page-break-after: avoid; }
h3 { font-size: 13pt; margin-top: 14pt; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 9.5pt; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #777; padding: 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
pre, code { white-space: pre-wrap; overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
.cover { text-align: center; padding-top: 25mm; }
.cover h2 { font-size: 20pt; margin-bottom: 30pt; }
.page-break { page-break-after: always; break-after: page; }
</style>

# EduGuard Project Synopsis

<div class="cover">

## Cover Page

**Project Title:** EduGuard - AI-Assisted Student Risk Management and Mentorship Platform  
**Project Type:** BCA Major Project  
**Submitted By:** Ashish (Roll No. 4622), Rahul (Roll No. 4634), Vishakha (Roll No. 4626)  
**Course:** Bachelor of Computer Applications  
**College:** Dronacharya PG College  
**University:** Himachal Pradesh University (HPU)  
**Academic Session:** 2024-2027  
**Submitted To:** Department of BCA  
**Project Guide:** Miliya Mahajan

</div>

<div class="page-break"></div>

---

## 1. Project Title

**EduGuard - AI-Assisted Student Risk Management and Mentorship Platform**

## 2. Introduction

EduGuard is a web-based student management and early-warning platform. It brings attendance, examination marks, behaviour, contributions, assignments, mentor communication, notifications, and student risk information into one system. Its purpose is to help colleges identify academic difficulty early and give mentors enough information to intervene before a student falls further behind.

The platform provides separate experiences for super administrators, college administrators, mentors, and students. A deterministic risk engine calculates a transparent score from academic and behavioural records. Artificial intelligence is used separately to explain the score and prepare improvement guidance; it does not replace the rule-based calculation or the mentor's judgement.

## 3. Background and Need

Many institutions maintain attendance in registers, marks in spreadsheets, announcements in messaging groups, and mentor notes in separate files. This makes a complete student view difficult to obtain. Important warning signs may be noticed only after an examination result or attendance shortage becomes serious.

EduGuard addresses this problem by creating a central student profile and connecting it with automated risk scoring, mentor dashboards, alerts, assignments, chat, and report generation. A student can see personal information and guidance, while authorized staff can monitor students within their assigned college or class.

## 4. Problem Statement

The existing manual or semi-digital process has the following problems:

- Attendance, marks, behaviour, and mentor records are disconnected.
- Risky academic patterns are identified late.
- Manual calculations are repetitive and may contain errors.
- Mentors cannot quickly compare all relevant student indicators.
- Students may not receive timely guidance or feedback.
- Announcements and academic communication are fragmented.
- Report-card preparation consumes staff time.
- Institution-level administrators lack a consolidated operational view.

## 5. Proposed Solution

EduGuard provides a React web interface connected to an ASP.NET Core API and MongoDB. Authenticated users receive role-specific routes and dashboards. The system stores student academic records, calculates risk scores, sends notifications, supports mentor-student chat through SignalR, and generates report-card files through a background worker.

The current implementation supports the main academic risk and mentorship workflow together with Version 2 session-based attendance and scoped student leadership assignments such as Class Representative (CR).

## 6. Project Objectives

1. Centralize student academic and mentorship information.
2. Detect at-risk students using an understandable rule-based score.
3. Allow mentors to monitor assigned students and classes.
4. Provide college-specific administration and reporting.
5. Improve student-mentor communication through real-time chat.
6. Generate AI-assisted explanations, recovery plans, and study plans.
7. Deliver announcements, events, assignments, and notifications.
8. Generate downloadable student report cards.
9. Enforce authenticated, role-based access to protected information.
10. Provide auditable, time-restricted V2 attendance marking.

## 7. Scope

### 7.1 Current Implemented Scope

- Login, registration, JWT authentication, refresh tokens, and account verification.
- Super-admin, college-admin, mentor, and student user experiences.
- College, degree, mentor, and student management.
- Manual student creation and Excel-based import.
- Attendance percentage, subject marks, behaviour, and contributions.
- Deterministic student risk calculation and risk-level filtering.
- AI risk explanations, improvement plans, and study planning.
- Mentor-student chat with SignalR delivery and AI fallback.
- Stored notifications, announcements, and events.
- Assignment creation, submission, and grading endpoints.
- Background report-card generation and download.
- Docker configuration and a health endpoint for deployment.

### 7.2 Implemented V2 Scope

- Daily morning and afternoon attendance sessions.
- GitHub-style attendance history on the student profile.
- Class Representative attendance permissions.
- A compact CR leadership badge on student profiles.
- College-scoped student leadership assignment and revocation.
- College-admin views for leaders and class attendance.
- Present, absent, and total-student summary counts.
- Time-window enforcement and attendance change history.

### 7.3 Out of Scope / Future Possibilities

- Biometric or facial-recognition attendance.
- Parent portal and native mobile applications.
- University ERP integration.
- A trained predictive machine-learning model.
- SMS delivery, video counselling, and fee management.

## 8. Feasibility Study

### 8.1 Technical Feasibility

React, TypeScript, ASP.NET Core, MongoDB, SignalR, and Docker are suitable for a modular web platform. The existing API and document database can be extended with attendance records without introducing another backend or database.

### 8.2 Economic Feasibility

The main development technologies are open source. The application can use free or low-cost hosting tiers during academic demonstration. External email and AI services may introduce usage costs at larger scale.

### 8.3 Operational Feasibility

The dashboards follow familiar college workflows: administrators manage institutional data, mentors manage assigned students, and students view their own records. V2 delegates limited attendance work to selected student leaders while keeping college-admin oversight.

### 8.4 Legal and Ethical Feasibility

Student information must be protected using authorization, secure configuration, and restricted data access. Risk scores must remain advisory and transparent. They must not be used as the sole basis for punishment or disciplinary action. Student information sent to an external AI service should be minimized and covered by institutional privacy policy.

## 9. User Roles and Permissions

| Role | Main Permissions |
|---|---|
| Super Admin | Manage colleges and college administrators; view platform-level college statistics; block or update colleges. |
| College Admin | Manage mentors and students within the college; create announcements/events; view risk students and college data. |
| Mentor | View assigned classes/students; update academic information; monitor risk; create assignments; chat with students. |
| Student | View own profile, marks, attendance percentage, risk guidance, notifications, assignments, reports, and mentor chat. |
| CR (V2) | Student permissions plus attendance routes for the assigned class and session. |
| Discipline Head (V2) | Student permissions plus discipline-related recording/monitoring routes defined by college policy. |
| Academic Head (V2) | Student permissions plus class academic coordination routes, without unrestricted marks editing. |
| Activity Head (V2) | Student permissions plus approved contribution/activity coordination routes. |

The V2 leadership roles are scoped assignments attached to a student. They are not replacements for the base `student` identity and do not receive college-admin or mentor authority.

## 10. Main System Modules

### 10.1 Authentication Module

The authentication controller supports registration, student signup, verification, login, token refresh, logout, and retrieval of the current user. Passwords are hashed, JWT claims carry identity and role information, and protected controllers use authorization attributes. Secrets and service credentials are read from configuration or environment variables and must not be committed to source control.

### 10.2 College Administration Module

Super administrators manage colleges, degrees, and college administrators. College administrators manage mentors and students associated with their college and publish announcements, events, or syllabus information. Server-side college scoping is necessary on every college-admin query to prevent cross-college access.

### 10.3 Student and Mentor Module

Student records contain identity, roll number, college, course, class, semester, mentor, attendance percentage, subject marks, behaviour, contributions, risk result, AI guidance, verification details, and timestamps. Mentors contain college/course assignments, department, batch, semester, assigned classes, status, capacity, and online state.

Students can be added manually or imported from an Excel file. Mentors can be approved by a college administrator. The system supports mentor selection/assignment and class-based student views.

### 10.4 Marks and Attendance Module

Legacy student records retain the aggregate attendance percentage for compatibility. V2 stores date-wise morning and afternoon attendance records and derives `sessionAttendancePercentage` for the risk engine when finalized session data exists. Marks remain stored per subject with class tests, mid-term marks, house-examination marks, and maximum marks.

### 10.5 Student Risk Module

The risk engine is deterministic. It calculates subject percentages, an overall marks average, failed subjects, missing records, behaviour impact, contribution impact, and attendance impact. The score is capped between 0 and 100 and stored with a risk category.

### 10.6 AI Assistance Module

The backend integrates with NVIDIA NIM. AI is used for readable risk explanations, improvement/recovery guidance, study planning, and chat fallback. The rule-based engine remains the source of the numeric risk score. AI output may be unavailable or imperfect and should be reviewed by a mentor.

### 10.7 Chat and Notification Module

SignalR provides real-time communication and online updates. Messages are persisted in MongoDB. When a mentor is unavailable, the AI service can provide a fallback response. Notifications are stored, listed for the current user, marked as read, marked all-read, or deleted.

### 10.8 Assignment and Report Module

The API supports assignment creation, student assignment retrieval, submission, and grading. Report-card generation uses queued jobs with statuses and produces downloadable report output. Generated files are runtime artifacts rather than source documents.

## 11. System Architecture

**Architecture flow:**

1. Student, mentor, or administrator opens the React and TypeScript frontend.
2. The frontend sends authenticated REST requests to ASP.NET Core controllers.
3. Real-time chat and notifications use the SignalR EduGuard Hub.
4. Backend services read and write application data in MongoDB.
5. Backend services call NVIDIA NIM for AI assistance and Resend for email.
6. The report queue worker generates report-card output in the background.

The active backend is the C# project in `backend/`. The TypeScript backend directory is a sample/alternative implementation and is not part of the active deployment architecture.

## 12. Database Overview

| Collection | Purpose and Important Data |
|---|---|
| Students | Profile, college/course/class, mentor, attendance percentage, marks, behaviour, contributions, risk, verification, and AI guidance. |
| Mentors | Identity, college/course, assigned classes, approval status, capacity, and online state. |
| Admins | Super-admin or college-admin identity and college association. |
| Colleges | College details, administrator relationship, and active/blocked state. |
| Degrees | Degree/course information related to colleges. |
| Messages | Stored student/mentor/AI chat messages and timestamps. |
| Notifications | Recipient, type, content, read state, and related entity information. |
| Assignments | Assignment content, target students/classes, and deadline information. |
| Submissions | Student work, assignment relationship, grading, and feedback. |
| Announcements / Events | College communication and event information. |
| Report Jobs | Requested report, processing status, output location, and errors. |
| Attendance Records (V2) | Date, class, session, student status, marker, timestamps, and change history. |
| Leadership Assignments (V2) | Student, leadership type, college/class scope, validity, and assigning administrator. |

**Database relationships:**

- One college has many administrators, mentors, and students.
- One mentor guides many assigned students.
- One student participates in many messages and receives many notifications.
- One assignment can have many submissions; each submission belongs to one student.
- One student can request many report jobs.
- In V2, one student can have many attendance records and leadership assignments.

## 13. Risk-Scoring Methodology

| Factor | Condition | Risk Points |
|---|---|---:|
| Attendance | Below 50% | 40 |
| Attendance | 50% to below 75% | 20 |
| Overall marks average | Below 35% | 30 |
| Overall marks average | 35% to below 50% | 15 |
| Failed subject | Subject average below 35% | 10 each, maximum 30 |
| Behaviour | `bad` | 20 |
| Behaviour | `average` | 8 |
| Contributions | None recorded | 5 |
| Record completeness | More than 3 configured subjects missing data | 5 |

The overall score is capped at 100. Categories are Low (0-25), Medium (greater than 25 to 50), High (greater than 50 to 75), and Critical (greater than 75 to 100).

Example: a student with 70% attendance receives 20 points. If the marks average is 45%, another 15 points are added. One failed subject adds 10 points and no contribution adds 5 points. The final score is 50, which is Medium risk. This calculation is transparent and does not use AI.

## 14. Current Functional Requirements

- **FR-01:** The system shall authenticate users and issue role-bearing access tokens.
- **FR-02:** The system shall restrict protected routes according to the authenticated role.
- **FR-03:** The system shall allow authorized administrators to manage colleges, mentors, and students.
- **FR-04:** The system shall allow student records to be added manually or imported from Excel.
- **FR-05:** The system shall store academic, behavioural, and contribution information.
- **FR-06:** The system shall calculate and store a risk score and category.
- **FR-07:** The system shall allow authorized users to filter students by class and risk.
- **FR-08:** The system shall provide AI-assisted explanations and improvement guidance.
- **FR-09:** The system shall store and deliver chat messages and notifications.
- **FR-10:** The system shall support assignments, submissions, and grading.
- **FR-11:** The system shall create and track report-card generation jobs.
- **FR-12:** Students shall only view their permitted profile and student routes.

<div class="page-break"></div>

## 15. Implemented Version 2: Attendance and Student Leadership

### 15.1 V2 Purpose

V2 adds daily, session-wise attendance while retaining legacy attendance compatibility. It also adds controlled student leadership responsibilities. The central principle is least privilege: a CR may mark attendance for an assigned class and active session, but does not become a mentor or administrator.

### 15.2 Leadership Roles

V2 supports college-scoped student leadership assignments. The CR assignment has the implemented attendance permission; other leadership labels can be assigned and displayed without automatically receiving privileged backend routes:

1. **Class Representative (CR):** May open attendance routes for the assigned class and mark present/absent status during permitted windows.
2. **Discipline Head:** May access approved discipline coordination routes and submit observations; sensitive action remains with staff.
3. **Academic Head:** May coordinate academic notices and class-level academic activities; cannot alter official marks unless separately authorized as staff.
4. **Activity Head:** May coordinate approved contribution, club, cultural, or sports activity records.

A student may hold one or more assignments. Each assignment must contain a college, course/class scope, start date, end date, active status, and the college administrator who granted it. The student keeps the base role `student`; backend authorization checks the active assignment and scope.

### 15.3 CR Badge and Visibility

When a student has an active CR assignment, the UI shows a compact **CR** badge beside the student's name on the profile. Leadership assignments are also visible in the college-admin management view. Badges are display indicators only; backend authorization remains the source of permission.

### 15.4 Attendance Sessions and Time Rules

Each teaching day has two attendance sessions:

| Session | Attendance Editing Window | Meaning |
|---|---|---|
| Morning | 10:00 AM to 12:00 PM | Morning teaching session |
| Afternoon | 12:00 PM to 3:00 PM | Afternoon teaching session |

- The server, not the browser, validates the current college-local time.
- Morning attendance can be created or changed only from 10:00 AM up to 12:00 PM.
- Afternoon attendance can be created or changed only from 12:00 PM up to 3:00 PM.
- At 12:00 PM, the morning window is closed and the afternoon window begins.
- After 3:00 PM, CR editing is locked.
- Weekends, holidays, and non-teaching days must be disabled through the college calendar.
- A college administrator may correct locked attendance only through a separate correction action with a mandatory reason and audit entry.
- Records use server timestamps and the college's configured timezone.

### 15.5 CR Attendance Workflow

1. The CR signs in with the normal student account.
2. The API verifies the token and active CR assignment.
3. The API verifies that the requested class matches the CR's assigned class.
4. The server checks the date, session, college timezone, and editing window.
5. The system loads the official active-student roster.
6. The CR marks each student Present or Absent.
7. Unmarked students cannot be silently treated as absent; the form must be complete before submission.
8. The API upserts one record per student, date, and session.
9. Each create/change stores who made it and when.
10. The UI displays updated totals for total, present, absent, and unmarked students.

### 15.6 GitHub-Style Student Attendance History

The student profile will include a contribution-calendar-style attendance history. Each day is one cell and uses status colors rather than commit counts:

- Green: present in both sessions.
- Light green: present in one session and the other session has no class.
- Amber: partially present or one present and one absent session.
- Red: absent in both required sessions.
- Grey: no class, holiday, future date, or no finalized record.

Hovering or focusing a cell shows the date, morning status, afternoon status, marker, and last update time. A text legend and accessible status label accompany colors. Summary values show attended sessions, required sessions, absent sessions, and percentage for the selected period.

### 15.7 College-Admin Attendance Tab

The existing college-admin dashboard includes an **Attendance** tab rather than a separate dashboard. It provides:

- Date, course, class, semester, and session filters.
- Total student count.
- Present student count.
- Absent student count.
- Unmarked student count so incomplete attendance is visible.
- Attendance percentage.
- Class-wise rows and drill-down to the student list.
- Morning/afternoon status and submission state.
- Name of the CR or authorized user who marked the session.
- Controlled correction of locked records with a required reason.

The college administrator also receives a **Student Leaders** view showing leadership assignments in that college, including type, class, active/inactive status, assignment dates, and assignment/revocation actions.

### 15.8 Implemented V2 Data Rules

An attendance record is unique by `studentId + date + session`. Records contain college, class, student, date, session, status, marked by, created time, updated time, and audit history. Admin corrections append an audit entry containing old status, new status, actor, time, and the mandatory reason.

V2 attendance percentages are derived from finalized required sessions:

`Attendance Percentage = Present Required Sessions / Total Finalized Required Sessions x 100`

Holidays, cancelled sessions, future dates, and unfinalized sessions must not reduce the percentage. The derived percentage can then feed the existing risk engine, preserving its current attendance thresholds while improving data accuracy.

### 15.9 V2 Functional Requirements

- **V2-FR-01:** A college admin shall assign and revoke scoped student leadership roles.
- **V2-FR-02:** The system shall display an active leadership badge beside the student's name.
- **V2-FR-03:** Only an active CR shall access CR attendance routes.
- **V2-FR-04:** A CR shall mark attendance only for the assigned college and class.
- **V2-FR-05:** Morning records shall be editable only from 10:00 AM to 12:00 PM.
- **V2-FR-06:** Afternoon records shall be editable only from 12:00 PM to 3:00 PM.
- **V2-FR-07:** The server shall reject CR attendance changes outside the valid window.
- **V2-FR-08:** The system shall preserve an audit history for attendance changes.
- **V2-FR-09:** Students shall view personal session attendance in a calendar-style history.
- **V2-FR-10:** College admins shall view total, present, absent, and unmarked counts by class.
- **V2-FR-11:** Locked corrections shall require college-admin permission and a reason.
- **V2-FR-12:** Derived attendance shall update the input used by the existing risk engine.

### 15.10 V2 Security and Validation

- Do not trust a role or CR flag supplied by the frontend.
- Verify JWT identity, active assignment, college, class, and session on every write.
- Use server time with an explicitly configured college timezone.
- Enforce the unique attendance key in MongoDB to prevent duplicates.
- Keep an immutable audit trail for corrections.
- Prevent a CR from changing leadership assignments or marking another class.
- Return aggregate attendance only within the college-admin's own college.
- Rate-limit repeated writes and validate every student against the active roster.

## 16. Non-Functional Requirements

- **NFR-01 Security:** Protected data and APIs shall require authentication and authorization.
- **NFR-02 Data Integrity:** Academic and attendance records shall be validated before persistence.
- **NFR-03 Performance:** Normal dashboard and class queries should complete without loading unrelated colleges.
- **NFR-04 Reliability:** Background report failures shall be recorded and reportable.
- **NFR-05 Usability:** Interfaces shall remain responsive on desktop and mobile screens.
- **NFR-06 Accessibility:** Attendance history shall not rely only on color.
- **NFR-07 Maintainability:** V2 shall extend the active ASP.NET backend and existing dashboards.
- **NFR-08 Auditability:** Attendance changes shall identify the actor, time, and change.
- **NFR-09 Portability:** Docker and environment configuration shall support local and hosted execution.
- **NFR-10 Privacy:** External AI requests shall contain only information necessary for the requested guidance.

## 17. Current Status and Limitations

### Implemented

Authentication, core roles, student/mentor/college data, risk calculation, profile pages, AI services, chat, notifications, announcements/events, assignments, reports, Docker, health monitoring, V2 attendance records, CR routes, leadership assignments, leadership badges, time-window enforcement, audit history, student attendance history, and college-admin attendance summaries have corresponding source-code support.

### Partial or Operationally Limited

Some large workflows, including assignments, AI output quality, report rendering, and authorization across every endpoint, still require continued end-to-end deployment testing. Legacy students without V2 session records continue to use their aggregate attendance percentage by design.

## 18. Testing Strategy

Testing should cover login and role access, college isolation, student import validation, risk-score boundaries, message persistence, notification read state, assignment submission, and report jobs. V2 testing must include window boundary times (before 10:00, exactly 10:00, exactly 12:00, exactly 3:00, and after 3:00), timezone behaviour, duplicate submissions, cross-class attempts, revoked CR access, incomplete rosters, holiday exclusion, locked corrections, and aggregate-count accuracy.

## 19. Expected Benefits

- Earlier identification of students who need help.
- A unified academic and mentorship record.
- Transparent risk calculation instead of opaque automated judgement.
- Faster communication and report preparation.
- Better college-level monitoring.
- In V2, accountable attendance marking with restricted CR delegation.
- Clear daily attendance history for students and administrators.

## 20. Conclusion

EduGuard combines student data, rule-based risk analysis, AI-assisted guidance, mentorship, communication, and institutional administration in one platform. Its existing implementation establishes the main student-risk and mentor workflow using React, ASP.NET Core, MongoDB, SignalR, and external AI/email services.

The implemented V2 extends this foundation with session-based attendance and scoped student leadership. CR attendance access, strict server-side time windows, profile badges, audit history, calendar-style attendance visualization, and class-level college-admin totals expand the platform without changing its core architecture.
