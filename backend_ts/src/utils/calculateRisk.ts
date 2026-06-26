import { IStudent, ISubjectMarks } from "../models/Student.js";
import { getSubjectsForSemester } from "../config/subjects.js";

export function calculateSubjectAverage(subject: ISubjectMarks): number | null {
  const percentages: number[] = [];

  // 1. Class Tests
  if (subject.classTests && subject.classTests.length > 0) {
    let totalObtained = 0;
    let totalMax = 0;
    for (const test of subject.classTests) {
      totalObtained += test.marks;
      totalMax += test.maxMarks;
    }
    if (totalMax > 0) {
      percentages.push((totalObtained / totalMax) * 100);
    }
  }

  // 2. Mid Term
  if (
    subject.midTerm &&
    subject.midTerm.marks !== null &&
    subject.midTerm.maxMarks > 0
  ) {
    percentages.push((subject.midTerm.marks / subject.midTerm.maxMarks) * 100);
  }

  // 3. House Exam
  if (
    subject.houseExam &&
    subject.houseExam.marks !== null &&
    subject.houseExam.maxMarks > 0
  ) {
    percentages.push((subject.houseExam.marks / subject.houseExam.maxMarks) * 100);
  }

  if (percentages.length === 0) return null;

  // Average of the component percentages
  const sum = percentages.reduce((a, b) => a + b, 0);
  return sum / percentages.length;
}

export interface RiskResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export function calculateRisk(student: IStudent): RiskResult {
  let score = 0;

  // 1. Attendance Scoring
  if (student.attendance !== null && student.attendance !== undefined) {
    if (student.attendance < 50) {
      score += 40;
    } else if (student.attendance < 75) {
      score += 20;
    }
  }

  // Fetch subject configuration for this student's course + semester
  const course = (student.course || "").toUpperCase();
  const definedSubjects = getSubjectsForSemester(course, student.semester);
  
  let totalSubjectPercentageSum = 0;
  let subjectsWithDataCount = 0;
  let failingSubjectsCount = 0;
  let missingSubjectsCount = 0;

  if (definedSubjects.length > 0) {
    for (const subDef of definedSubjects) {
      const studentSub = student.marks.find(
        (m) => m.subjectName.toLowerCase() === subDef.name.toLowerCase()
      );

      if (studentSub) {
        const subAvg = calculateSubjectAverage(studentSub);
        if (subAvg !== null) {
          totalSubjectPercentageSum += subAvg;
          subjectsWithDataCount++;
          if (subAvg < 35) {
            failingSubjectsCount++;
          }
        } else {
          missingSubjectsCount++;
        }
      } else {
        missingSubjectsCount++;
      }
    }
  } else {
    // If no course config found, fallback to existing marks array
    for (const studentSub of student.marks) {
      const subAvg = calculateSubjectAverage(studentSub);
      if (subAvg !== null) {
        totalSubjectPercentageSum += subAvg;
        subjectsWithDataCount++;
        if (subAvg < 35) {
          failingSubjectsCount++;
        }
      }
    }
  }

  // 2. Average Marks Scoring
  const overallMarksAverage =
    subjectsWithDataCount > 0
      ? totalSubjectPercentageSum / subjectsWithDataCount
      : null;

  if (overallMarksAverage !== null) {
    if (overallMarksAverage < 35) {
      score += 30;
    } else if (overallMarksAverage < 50) {
      score += 15;
    }
  }

  // 3. Single Subject Failing Scoring (Capped at 30 points)
  const singleSubjectFailingPenalty = failingSubjectsCount * 10;
  score += Math.min(singleSubjectFailingPenalty, 30);

  // 4. Behavior Scoring
  if (student.behavior === "bad") {
    score += 20;
  } else if (student.behavior === "average") {
    score += 8;
  }

  // 5. Contributions Scoring
  if (!student.contribution || student.contribution.length === 0) {
    score += 5;
  }

  // 6. Record Completeness Scoring (missing > 3 subjects data)
  if (missingSubjectsCount > 3) {
    score += 5;
  }

  // Cap at 100 and floor at 0
  const finalScore = Math.max(0, Math.min(score, 100));

  // Determine Risk Level
  let level: "low" | "medium" | "high" | "critical" = "low";
  if (finalScore <= 25) {
    level = "low";
  } else if (finalScore <= 50) {
    level = "medium";
  } else if (finalScore <= 75) {
    level = "high";
  } else {
    level = "critical";
  }

  return {
    riskScore: finalScore,
    riskLevel: level,
  };
}
