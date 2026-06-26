import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import Mentor from "../models/Mentor.js";
import Student, { IStudent } from "../models/Student.js";
import { emitToMentor } from "./socketManager.js";
import { calculateSubjectAverage } from "./calculateRisk.js";

/**
 * Creates a notification with duplicate protection.
 */
export async function createNotification(
  mentorId: mongoose.Types.ObjectId,
  studentId: mongoose.Types.ObjectId,
  type: "high_risk" | "attendance_drop" | "marks_drop" | "behavior_change" | "critical_alert",
  message: string,
  priority: "low" | "medium" | "high" | "urgent"
): Promise<any> {
  // Check if a similar unread notification already exists
  const existing = await Notification.findOne({
    mentorId,
    studentId,
    type,
    isRead: false,
  });

  if (existing) {
    return existing; // Avoid duplicates
  }

  const notification = await Notification.create({
    mentorId,
    studentId,
    type,
    message,
    priority,
    isRead: false,
  });

  // Push to student's notifications array
  await Student.findByIdAndUpdate(studentId, {
    $push: { notifications: notification._id },
  });

  // Emit real-time socket event
  const populated = await notification.populate({
    path: "studentId",
    select: "name rollNo class riskLevel riskScore",
  });
  
  emitToMentor(mentorId.toString(), "notification", populated);

  return notification;
}

/**
 * Evaluates student metrics and creates notifications when thresholds are crossed.
 */
export async function checkAndGenerateNotifications(
  student: IStudent,
  previous?: {
    riskLevel?: string;
    attendance?: number | null;
    averageMarks?: number | null;
    behavior?: string | null;
  }
) {
  if (!student.mentorId) return;

  const mentorId = student.mentorId;
  const studentId = student._id as mongoose.Types.ObjectId;

  // 1. Risk level changes to 'high' or 'critical'
  if (student.riskLevel === "high" || student.riskLevel === "critical") {
    if (!previous || previous.riskLevel !== student.riskLevel) {
      await createNotification(
        mentorId,
        studentId,
        "high_risk",
        `${student.name}'s risk level has escalated to ${student.riskLevel.toUpperCase()} (Score: ${student.riskScore}).`,
        student.riskLevel === "critical" ? "urgent" : "high"
      );
    }
  }

  // 2. Attendance drops below 75%
  if (student.attendance !== null && student.attendance < 75) {
    const wasAbove = !previous || previous.attendance === null || previous.attendance === undefined || previous.attendance >= 75;
    if (wasAbove) {
      await createNotification(
        mentorId,
        studentId,
        "attendance_drop",
        `${student.name}'s attendance has dropped to ${student.attendance}%, falling below the required 75% threshold.`,
        "high"
      );
    }
  }

  // 3. Average marks drop below 50%
  let currentAverageSum = 0;
  let currentAverageCount = 0;
  for (const m of student.marks) {
    const avg = calculateSubjectAverage(m);
    if (avg !== null) {
      currentAverageSum += avg;
      currentAverageCount++;
    }
  }
  const currentAverage = currentAverageCount > 0 ? currentAverageSum / currentAverageCount : null;

  if (currentAverage !== null && currentAverage < 50) {
    const wasAbove = !previous || previous.averageMarks === null || previous.averageMarks === undefined || previous.averageMarks >= 50;
    if (wasAbove) {
      await createNotification(
        mentorId,
        studentId,
        "marks_drop",
        `${student.name}'s average marks across all subjects have dropped to ${currentAverage.toFixed(1)}% (below 50%).`,
        "high"
      );
    }
  }

  // 4. Behavior changes to 'bad'
  if (student.behavior === "bad") {
    if (!previous || previous.behavior !== "bad") {
      await createNotification(
        mentorId,
        studentId,
        "behavior_change",
        `Behavioral concerns have been flagged for ${student.name} (marked as BAD).`,
        "medium"
      );
    }
  }

  // 5. Any single subject has houseExam < 35%
  for (const m of student.marks) {
    if (
      m.houseExam &&
      m.houseExam.marks !== null &&
      m.houseExam.maxMarks > 0
    ) {
      const percentage = (m.houseExam.marks / m.houseExam.maxMarks) * 100;
      if (percentage < 35) {
        await createNotification(
          mentorId,
          studentId,
          "marks_drop",
          `${student.name} performed poorly in the ${m.subjectName} House Exam (${m.houseExam.marks}/${m.houseExam.maxMarks}, ${percentage.toFixed(1)}%).`,
          "medium"
        );
      }
    }
  }

  // 6. Risk level reaches 'critical' -> notify all admins
  if (student.riskLevel === "critical") {
    if (!previous || previous.riskLevel !== "critical") {
      const admins = await Mentor.find({ role: "admin" });
      for (const admin of admins) {
        await createNotification(
          admin._id as mongoose.Types.ObjectId,
          studentId,
          "critical_alert",
          `CRITICAL ALERT: Student ${student.name} (${student.rollNo}) has reached critical risk status.`,
          "urgent"
        );
      }
    }
  }
}
