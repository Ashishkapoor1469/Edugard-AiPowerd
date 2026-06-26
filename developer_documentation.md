# EduGuard — Developer Documentation

Welcome to the **EduGuard** developer documentation. This guide details the system architecture, MongoDB schema models, Excel parsing algorithm, rule-based risk calculation formulas, Socket.io event loops, and instructions to run the application.

---

## 1. System Architecture Overview

EduGuard is built on a complete, modern full-stack JavaScript ecosystem:

```
+--------------------------------------------------------+
|                      React Frontend                    |
|       (React 19 + TypeScript + Tailwind CSS v4)         |
+---------------------------+----------------------------+
                            | HTTP / Socket.io
                            v
+---------------------------+----------------------------+
|                     Express Backend                    |
|          (Node.js + TypeScript + Socket.io)            |
+------+--------------------+---------------------+------+
       |                    |                     |
       v                    v                     v
+------+-----+      +-------+-------+      +------+-----+
|  MongoDB   |      |  SheetJS XLSX |      | NVIDIA NIM |
| (Mongoose) |      | (Bulk Upload) |      | (LLama3.1) |
+------------+      +---------------+      +------------+
```

---

## 2. Database Models (Mongoose)

### 2.1 Student Model (`src/models/Student.ts`)
Tracks student performance, behavior, co-curricular contributions, risk levels, and AI explanations:

- `rollNo`: unique indexed string used as the upsert matching key.
- `name`, `email`, `course` (BCA, BBA, BTECH, etc.), `class`, `semester`.
- `attendance`: percentage (0-100), null if unrecorded.
- `marks`: Subdocument array containing:
  - `subjectName`, `isPractical`.
  - `classTests`: array of `{ testNumber: number, marks: number, maxMarks: number }`.
  - `midTerm` / `houseExam`: `{ marks: number | null, maxMarks: number }`.
- `behavior`: enum `['excellent', 'good', 'average', 'bad']`.
- `contribution`: array of co-curricular event names.
- `riskScore`: rule-based calculated score (0-100).
- `riskLevel`: calculated enum `['low', 'medium', 'high', 'critical']`.
- `riskExplanation` & `aiImprovementPlan`: cached AI texts (cleared automatically on student data change to force fresh generation).

### 2.2 Mentor Model (`src/models/Mentor.ts`)
- `name`, `email` (unique), `password` (bcrypt hashed).
- `role`: enum `['mentor', 'admin']`.
- `assignedClasses`: array of class sections (e.g. `['BCA-A']`).
- `isOnline`: boolean representing connection status, synced via socket connection events.

### 2.3 Notification Model (`src/models/Notification.ts`)
- `mentorId` (ref Mentor), `studentId` (ref Student).
- `type`: enum `['high_risk', 'attendance_drop', 'marks_drop', 'behavior_change', 'critical_alert']`.
- `message`: description of the alert.
- `isRead`: boolean (default false).
- `priority`: enum `['low', 'medium', 'high', 'urgent']`.

### 2.4 Message Model (`src/models/Message.ts`)
- `studentId` (ref Student), `mentorId` (ref Mentor).
- `sender`: enum `['student', 'mentor', 'ai']`.
- `text`: message content.

---

## 3. Core Engine Mechanics

### 3.1 Excel Upload & Merging
- Implemented in `src/controllers/studentController.ts` using `xlsx` (SheetJS).
- Maps columns case-insensitively (`rollNo`, `name`, `attendance`, etc.).
- Parse marks headers using regex: `^(.+)_(Test\d+|MidTerm|HouseExam)(_Max)?$` (e.g. `Mathematics_Test1_Max`).
- **Upsert Merging:** Instead of replacing, it clones the student's existing marks array and selectively overrides or pushes new test numbers and midterm/house exam marks, ensuring previous subject marks are preserved.
- After upserting, it calculates the risk score, resets the cached AI analysis, saves, and evaluates alerting thresholds to trigger notifications.

### 3.2 Rule-Based Risk Scoring (`src/utils/calculateRisk.ts`)
EduGuard relies on a strict, rule-based formula to determine student risk scores (AI is only used for explanations):

1. **Attendance:**
   - `< 50%`: `+40` points.
   - `50-74%`: `+20` points.
2. **Marks Averages:**
   - Subject average = average of percentages of class tests, midterm, and house exams that have data.
   - Overall class average `< 35%`: `+30` points.
   - Overall class average `35-49%`: `+15` points.
3. **Single Subject Failing:**
   - Any single subject average `< 35%`: `+10` points per subject (capped at `+30` max).
4. **Behavior:**
   - `'bad'`: `+20` points.
   - `'average'`: `+8` points.
5. **Contributions:**
   - `0` contributions: `+5` points.
6. **Incomplete Records:**
   - Missing marks data for `> 3` subjects from `COURSE_SUBJECTS` definition: `+5` points.

*Total score is capped at `100`. Risk Levels: `0-25` low (green), `26-50` medium (yellow), `51-75` high (orange), `76-100` critical (red).*

---

## 4. Socket.io Connection & AI Fallback Loops

EduGuard uses Socket.io to keep mentors online, push real-time toast alerts, and fall back to the NVIDIA NIM AI Llama-3.1 model if the mentor is offline.

```
       [Mentor Online]  <====== Updates IMentor.isOnline = true
              |
              v
[Student Sends Chat Message]
              |
              +---> (Is Mentor Online?)
                        |
                        +---> YES: Broadcast to Mentor socket room
                        |
                        +---> NO: Trigger AI Fallback
                                   |
                                   v
                      Generate meta/llama-3.1 reply
                      using student data context
                                   |
                                   v
                      Save message with sender: 'ai'
                                   |
                                   v
                      Emit to chat room (purple bubble)
```

---

## 5. Local Setup & Execution

### 5.1 Environment Variables Configuration
Configure the `.env` file under `backend/.env`:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/eduguard
JWT_SECRET=your_jwt_secret_key
NVIDIA_API_KEY=your_nvidia_nim_api_key
```

### 5.2 Install Dependencies & Start Servers
Launch commands in separate terminals:

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
*(The frontend will spin up on Vite's default dev server, usually http://localhost:5173)*
