import { Request, Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import crypto from "crypto";
import Student, { IStudent, ISubjectMarks, IClassTest } from "../models/Student.js";
import Mentor from "../models/Mentor.js";
import Notification from "../models/Notification.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { AuthRequest } from "../middleware/authMiddleware.js";
import { calculateRisk, calculateSubjectAverage } from "../utils/calculateRisk.js";
import { checkAndGenerateNotifications } from "../utils/notificationHelper.js";
import { generateRiskExplanation, generateImprovementPlan, generateClassSummary } from "../utils/generateRiskExplanation.js";
import { addEmailToQueue } from "../utils/emailQueue.js";

// Helper to find case-insensitive keys in Excel row
function getRowValue(row: any, searchKeys: string[]): any {
  const rowKeys = Object.keys(row);
  for (const sk of searchKeys) {
    const foundKey = rowKeys.find((rk) => rk.toLowerCase().replace(/[\s_-]/g, "") === sk.toLowerCase().replace(/[\s_-]/g, ""));
    if (foundKey !== undefined) {
      return row[foundKey];
    }
  }
  return undefined;
}

// Parse student marks from row using Regex: ^(.+)_(Test\d+|MidTerm|HouseExam)(_Max)?$
function parseRowMarks(row: any): Record<string, any> {
  const parsedMarksMap: Record<string, {
    classTestsMap: Record<number, { marks?: number; maxMarks?: number }>;
    midTerm: { marks: number | null; maxMarks: number };
    houseExam: { marks: number | null; maxMarks: number };
  }> = {};

  const rowKeys = Object.keys(row);
  const regex = /^(.+)_(Test\d+|MidTerm|HouseExam)(_Max)?$/i;

  for (const key of rowKeys) {
    const match = key.match(regex);
    if (!match) continue;

    const subjectName = (match[1] || "").trim();
    const examType = (match[2] || "").toLowerCase();
    const isMax = !!match[3];
    const val = row[key] !== "" && row[key] !== null && row[key] !== undefined ? Number(row[key]) : null;

    if (val === null || isNaN(val)) continue;

    if (!parsedMarksMap[subjectName]) {
      parsedMarksMap[subjectName] = {
        classTestsMap: {},
        midTerm: { marks: null, maxMarks: 100 },
        houseExam: { marks: null, maxMarks: 100 },
      };
    }

    if (examType.startsWith("test")) {
      const testNum = parseInt(examType.substring(4));
      if (!isNaN(testNum)) {
        if (!parsedMarksMap[subjectName].classTestsMap[testNum]) {
          parsedMarksMap[subjectName].classTestsMap[testNum] = {};
        }
        if (isMax) {
          parsedMarksMap[subjectName].classTestsMap[testNum].maxMarks = val;
        } else {
          parsedMarksMap[subjectName].classTestsMap[testNum].marks = val;
        }
      }
    } else if (examType === "midterm") {
      if (isMax) {
        parsedMarksMap[subjectName].midTerm.maxMarks = val;
      } else {
        parsedMarksMap[subjectName].midTerm.marks = val;
      }
    } else if (examType === "houseexam") {
      if (isMax) {
        parsedMarksMap[subjectName].houseExam.maxMarks = val;
      } else {
        parsedMarksMap[subjectName].houseExam.marks = val;
      }
    }
  }

  return parsedMarksMap;
}

// Calculate old average marks before update
function getOldAverageMarks(student: IStudent): number | null {
  let sum = 0;
  let count = 0;
  for (const m of student.marks) {
    const avg = calculateSubjectAverage(m);
    if (avg !== null) {
      sum += avg;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

export const uploadStudents = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.file) {
      return next(new AppError(400, "Please upload an Excel file"));
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return next(new AppError(400, "Excel workbook contains no sheets"));
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return next(new AppError(400, "First sheet not found in Excel workbook"));
    }
    const rawData = XLSX.utils.sheet_to_json(sheet);

    if (rawData.length === 0) {
      return next(new AppError(400, "Excel sheet is empty"));
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rawData as any[]) {
      // 1. Extract base fields case-insensitively
      const rollNo = String(getRowValue(row, ["rollNo", "roll number", "roll_no", "roll"]) || "").trim();
      const name = String(getRowValue(row, ["name", "student name", "student_name"]) || "").trim();
      const email = String(getRowValue(row, ["email", "emailId", "mail"]) || "").trim();
      const phoneNo = String(getRowValue(row, ["phoneNo", "phone number", "phone_no", "phone", "mobile", "contact"]) || "").trim();
      const course = String(getRowValue(row, ["course", "degree"]) || "").trim().toUpperCase();
      const className = String(getRowValue(row, ["class", "section"]) || "").trim();
      const semesterVal = getRowValue(row, ["semester", "sem"]);
      const attendanceVal = getRowValue(row, ["attendance", "attendance %", "presence"]);
      const behaviorVal = String(getRowValue(row, ["behavior", "conduct"]) || "").trim().toLowerCase();
      const contributionVal = getRowValue(row, ["contribution", "events", "activities"]);

      if (!rollNo) {
        skippedCount++;
        continue;
      }

      // Check if student exists
      let student = await Student.findOne({ rollNo });
      let isNew = false;
      let verificationToken: string | null = null;

      let oldValues: any = undefined;

      if (student) {
        // Capture previous values for notification comparison
        oldValues = {
          riskLevel: student.riskLevel,
          attendance: student.attendance,
          behavior: student.behavior,
          averageMarks: getOldAverageMarks(student),
        };
      } else {
        isNew = true;
        // Require name, course, class, and semester for new student
        if (!name || !course || !className || !semesterVal) {
          skippedCount++;
          continue;
        }
        student = new Student({
          rollNo,
          marks: [],
        });

        if (email) {
          verificationToken = crypto.randomBytes(32).toString("hex");
          student.verificationToken = verificationToken;
          student.isVerified = false;
        }
      }

      // Update basic fields if they are present in this row
      if (name) student.name = name;
      if (email) student.email = email;
      if (phoneNo) student.phoneNo = phoneNo;
      if (course) student.course = course;
      if (className) student.class = className;
      if (semesterVal !== undefined) student.semester = Number(semesterVal);
      if (attendanceVal !== undefined && attendanceVal !== null && attendanceVal !== "") {
        student.attendance = Number(attendanceVal);
      }
      if (behaviorVal && ["excellent", "good", "average", "bad"].includes(behaviorVal)) {
        student.behavior = behaviorVal as any;
      }

      // Contribution parsing and merging
      if (contributionVal !== undefined && contributionVal !== null && contributionVal !== "") {
        const events = String(contributionVal)
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        student.contribution = Array.from(new Set([...(student.contribution || []), ...events]));
      }

      // 2. Parse and merge marks array
      const parsedMarksMap = parseRowMarks(row);
      for (const subjectName of Object.keys(parsedMarksMap)) {
        const parsedSub = parsedMarksMap[subjectName];

        let studentSub = student.marks.find(
          (m) => m.subjectName.toLowerCase() === subjectName.toLowerCase()
        );

        if (!studentSub) {
          studentSub = {
            subjectName,
            isPractical: false, // Default, will calculate in risk
            classTests: [],
            midTerm: { marks: null, maxMarks: 100 },
            houseExam: { marks: null, maxMarks: 100 },
          };
          student.marks.push(studentSub);
        }

        // Merge tests
        for (const testKey of Object.keys(parsedSub.classTestsMap)) {
          const testNum = Number(testKey);
          const parsedTest = parsedSub.classTestsMap[testNum];

          let testEntry = studentSub.classTests.find((t) => t.testNumber === testNum);
          if (!testEntry) {
            testEntry = { testNumber: testNum, marks: 0, maxMarks: 25 };
            studentSub.classTests.push(testEntry);
          }
          if (parsedTest.marks !== undefined) testEntry.marks = parsedTest.marks;
          if (parsedTest.maxMarks !== undefined) testEntry.maxMarks = parsedTest.maxMarks;
        }

        // Merge midterm
        if (parsedSub.midTerm.marks !== null) {
          studentSub.midTerm.marks = parsedSub.midTerm.marks;
        }
        if (parsedSub.midTerm.maxMarks !== undefined) {
          studentSub.midTerm.maxMarks = parsedSub.midTerm.maxMarks;
        }

        // Merge houseexam
        if (parsedSub.houseExam.marks !== null) {
          studentSub.houseExam.marks = parsedSub.houseExam.marks;
        }
        if (parsedSub.houseExam.maxMarks !== undefined) {
          studentSub.houseExam.maxMarks = parsedSub.houseExam.maxMarks;
        }
      }

      // Link mentor if not yet set
      if (!student.mentorId) {
        // Look for a mentor who is assigned this class
        const assignedMentor = await Mentor.findOne({ assignedClasses: student.class });
        if (assignedMentor) {
          student.mentorId = assignedMentor._id as any;
        } else if (req.user) {
          student.mentorId = req.user._id as any;
        }
      }

      // 3. Recalculate Risk
      const riskResult = calculateRisk(student);
      student.riskScore = riskResult.riskScore;
      student.riskLevel = riskResult.riskLevel;

      // 4. Clear AI Cached text on data update
      student.riskExplanation = "";
      student.aiImprovementPlan = "";

      // Save Student
      await student.save({ validateBeforeSave: true });

      if (isNew && student.email && verificationToken) {
        addEmailToQueue(student.email, verificationToken);
      }

      // 5. Trigger notifications check
      await checkAndGenerateNotifications(student, oldValues);

      if (isNew) {
        createdCount++;
      } else {
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
      },
    });
  }
);

export const getStudents = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.role === "student") {
      return next(new AppError(403, "Access denied. Mentors only."));
    }

    const { course, class: className, riskLevel, search, page = "1", limit = "10" } = req.query;

    const query: any = {};

    // Apply filters
    if (course) query.course = course;
    if (className) query.class = className;
    if (riskLevel) query.riskLevel = riskLevel;

    // Search by name or rollNo
    if (search) {
      query.$or = [
        { name: { $regex: String(search), $options: "i" } },
        { rollNo: { $regex: String(search), $options: "i" } },
      ];
    }

    // Role restrictions: If mentor is not admin, only show their students
    if (req.user && req.user.role !== "admin") {
      query.class = { $in: req.user.assignedClasses };
    }

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skipNum = (pageNum - 1) * limitNum;

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .populate("mentorId", "name email")
      .sort({ riskScore: -1 }) // Sort highest risk first
      .skip(skipNum)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: students.length,
      total,
      pages: Math.ceil(total / limitNum),
      page: pageNum,
      data: students,
    });
  }
);

export const getStudentProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const student = await Student.findById(req.params.id)
      .populate("mentorId", "name email isOnline")
      .populate({
        path: "notifications",
        options: { sort: { createdAt: -1 } },
      });

    if (!student) {
      return next(new AppError(404, "Student not found"));
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  }
);

export const updateStudent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return next(new AppError(404, "Student not found"));
    }

    // Capture old values
    const oldValues = {
      riskLevel: student.riskLevel,
      attendance: student.attendance,
      behavior: student.behavior,
      averageMarks: getOldAverageMarks(student),
    };

    // Update simple fields from request body
    const fieldsToUpdate = ["name", "email", "course", "class", "semester", "attendance", "behavior", "contribution", "mentorId"];
    for (const key of fieldsToUpdate) {
      if (req.body[key] !== undefined) {
        (student as any)[key] = req.body[key];
      }
    }

    // If marks are sent to update directly, merge them
    if (req.body.marks) {
      student.marks = req.body.marks;
    }

    // Recalculate Risk
    const riskResult = calculateRisk(student);
    student.riskScore = riskResult.riskScore;
    student.riskLevel = riskResult.riskLevel;

    // Reset AI cache
    student.riskExplanation = "";
    student.aiImprovementPlan = "";

    await student.save({ validateBeforeSave: true });

    // Check for notifications
    await checkAndGenerateNotifications(student, oldValues);

    res.status(200).json({
      success: true,
      data: student,
    });
  }
);

export const getStudentExplanation = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return next(new AppError(404, "Student not found"));
    }

    // If cached, return immediately
    if (student.riskExplanation) {
      return res.status(200).json({
        success: true,
        data: student.riskExplanation,
      });
    }

    // Generate, cache and return
    const explanation = await generateRiskExplanation(student);
    student.riskExplanation = explanation;
    await student.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: explanation,
    });
  }
);

export const getStudentImprovementPlan = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return next(new AppError(404, "Student not found"));
    }

    // If cached, return immediately
    if (student.aiImprovementPlan) {
      return res.status(200).json({
        success: true,
        data: student.aiImprovementPlan,
      });
    }

    // Generate, cache and return
    const plan = await generateImprovementPlan(student);
    student.aiImprovementPlan = plan;
    await student.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: plan,
    });
  }
);

export const getClassSummaryController = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const className = req.params.className as string;

    // Check permissions
    if (req.user && req.user.role !== "admin" && !req.user.assignedClasses.includes(className)) {
      return next(new AppError(403, "You do not have access to this class"));
    }

    const students = await Student.find({ class: className } as any);

    if (students.length === 0) {
      return next(new AppError(404, "No students found in this class"));
    }

    // 1. Calculate Aggregate Stats
    let totalStudents = students.length;
    let attendanceSum = 0;
    let attendanceCount = 0;
    let atRiskCount = 0;

    const subjectSums: Record<string, number> = {};
    const subjectCounts: Record<string, number> = {};

    for (const student of students) {
      if (student.attendance !== null && student.attendance !== undefined) {
        attendanceSum += student.attendance;
        attendanceCount++;
      }

      if (student.riskLevel === "high" || student.riskLevel === "critical") {
        atRiskCount++;
      }

      for (const mark of student.marks) {
        const avg = calculateSubjectAverage(mark);
        if (avg !== null) {
          const subName = mark.subjectName;
          subjectSums[subName] = (subjectSums[subName] || 0) + avg;
          subjectCounts[subName] = (subjectCounts[subName] || 0) + 1;
        }
      }
    }

    const avgAttendance = attendanceCount > 0 ? attendanceSum / attendanceCount : 0;

    const subjectAverages: Record<string, number> = {};
    let marksSum = 0;
    let marksCount = 0;
    const failingSubjects: string[] = [];

    for (const subName of Object.keys(subjectSums)) {
      const avg = (subjectSums[subName] || 0) / (subjectCounts[subName] || 1);
      subjectAverages[subName] = avg;
      marksSum += avg;
      marksCount++;

      if (avg < 50) {
        failingSubjects.push(subName);
      }
    }

    const avgMarks = marksCount > 0 ? marksSum / marksCount : 0;

    const classStats = {
      className,
      totalStudents,
      avgAttendance,
      avgMarks,
      atRiskCount,
      failingSubjects,
    };

    // Generate AI Summary
    const summary = await generateClassSummary(classStats);

    res.status(200).json({
      success: true,
      data: {
        stats: classStats,
        subjectAverages,
        summary,
      },
    });
  }
);

export const getStatsController = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }

    const query: any = {};
    if (req.user.role !== "admin") {
      query.class = { $in: req.user.assignedClasses };
    }

    const totalStudents = await Student.countDocuments(query);
    const atRiskStudents = await Student.countDocuments({
      ...query,
      riskLevel: { $in: ["high", "critical"] },
    });

    const studentsForAttendance = await Student.find(query).select("attendance");
    let attendanceSum = 0;
    let attendanceCount = 0;
    for (const s of studentsForAttendance) {
      if (s.attendance !== null && s.attendance !== undefined) {
        attendanceSum += s.attendance;
        attendanceCount++;
      }
    }
    const avgAttendance = attendanceCount > 0 ? attendanceSum / attendanceCount : 0;

    // Critical alerts today (created in last 24 hours with high/urgent priority)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const criticalAlertsCount = await Notification.countDocuments({
      mentorId: req.user._id,
      priority: { $in: ["high", "urgent"] },
      createdAt: { $gte: oneDayAgo },
    });

    // Risk distribution
    const lowCount = await Student.countDocuments({ ...query, riskLevel: "low" });
    const mediumCount = await Student.countDocuments({ ...query, riskLevel: "medium" });
    const highCount = await Student.countDocuments({ ...query, riskLevel: "high" });
    const criticalCount = await Student.countDocuments({ ...query, riskLevel: "critical" });

    // Recent notifications
    const recentNotifications = await Notification.find({ mentorId: req.user._id })
      .populate("studentId", "name rollNo class riskLevel riskScore")
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        atRiskStudents,
        avgAttendance,
        criticalAlertsCount,
        riskDistribution: {
          low: lowCount,
          medium: mediumCount,
          high: highCount,
          critical: criticalCount,
        },
        recentNotifications,
      },
    });
  }
);

export const selectMentor = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.role !== "student" || !req.student) {
      return next(new AppError(403, "Only students can select mentors"));
    }

    const { mentorId } = req.body;
    if (!mentorId) {
      return next(new AppError(400, "Please provide mentorId"));
    }

    const mentor = await Mentor.findById(mentorId);
    if (!mentor) {
      return next(new AppError(404, "Mentor not found"));
    }

    const student = await Student.findById(req.student._id);
    if (!student) {
      return next(new AppError(404, "Student profile not found"));
    }

    if (student.mentorId) {
      return next(new AppError(400, "You already have an assigned mentor"));
    }

    const MAX_STUDENTS_PER_MENTOR = 30;
    const count = await Student.countDocuments({ mentorId });
    if (count >= MAX_STUDENTS_PER_MENTOR) {
      return next(new AppError(400, `Mentor group is full. Max capacity is ${MAX_STUDENTS_PER_MENTOR} students.`));
    }

    student.mentorId = mentorId;
    await student.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Mentor successfully assigned",
      data: student,
    });
  }
);