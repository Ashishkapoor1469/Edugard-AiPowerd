using System;
using System.Collections.Generic;
using System.Linq;
using EduGuard.Models;
using EduGuard.Config;

namespace EduGuard.Services
{
    public class RiskResult
    {
        public double RiskScore { get; set; }
        public string RiskLevel { get; set; } = "low";
    }

    public static class RiskEngine
    {
        private static readonly IReadOnlyList<IRiskScoringRule> ScoringRules = RiskRuleFactory.CreateDefault();

        public static double? CalculateSubjectAverage(SubjectMarks subject)
        {
            var percentages = new List<double>();

            // 1. Class Tests
            if (subject.ClassTests != null && subject.ClassTests.Count > 0)
            {
                double totalObtained = 0;
                double totalMax = 0;
                foreach (var test in subject.ClassTests)
                {
                    totalObtained += test.Marks;
                    totalMax += test.MaxMarks;
                }
                if (totalMax > 0)
                {
                    percentages.Add((totalObtained / totalMax) * 100);
                }
            }

            // 2. Mid Term
            if (subject.MidTerm != null && subject.MidTerm.Marks.HasValue && subject.MidTerm.MaxMarks > 0)
            {
                percentages.Add((subject.MidTerm.Marks.Value / subject.MidTerm.MaxMarks) * 100);
            }

            // 3. House Exam
            if (subject.HouseExam != null && subject.HouseExam.Marks.HasValue && subject.HouseExam.MaxMarks > 0)
            {
                percentages.Add((subject.HouseExam.Marks.Value / subject.HouseExam.MaxMarks) * 100);
            }

            if (percentages.Count == 0) return null;

            return percentages.Average();
        }

        public static RiskResult CalculateRisk(Student student)
        {
            var attendancePercentage = student.SessionAttendancePercentage ?? student.Attendance;

            // Fetch subject configuration
            string course = (student.Course ?? "").ToUpper();
            var definedSubjects = Subjects.GetSubjectsForSemester(course, student.Semester);

            double totalSubjectPercentageSum = 0;
            int subjectsWithDataCount = 0;
            int failingSubjectsCount = 0;
            int missingSubjectsCount = 0;

            if (definedSubjects != null && definedSubjects.Count > 0)
            {
                foreach (var subDef in definedSubjects)
                {
                    var studentSub = student.Marks?.FirstOrDefault(
                        m => string.Equals(m.SubjectName, subDef.Name, StringComparison.OrdinalIgnoreCase)
                    );

                    if (studentSub != null)
                    {
                        var subAvg = CalculateSubjectAverage(studentSub);
                        if (subAvg.HasValue)
                        {
                            totalSubjectPercentageSum += subAvg.Value;
                            subjectsWithDataCount++;
                            if (subAvg.Value < 35)
                            {
                                failingSubjectsCount++;
                            }
                        }
                        else
                        {
                            missingSubjectsCount++;
                        }
                    }
                    else
                    {
                        missingSubjectsCount++;
                    }
                }
            }
            else
            {
                // Fallback to flat marks list
                if (student.Marks != null)
                {
                    foreach (var studentSub in student.Marks)
                    {
                        var subAvg = CalculateSubjectAverage(studentSub);
                        if (subAvg.HasValue)
                        {
                            totalSubjectPercentageSum += subAvg.Value;
                            subjectsWithDataCount++;
                            if (subAvg.Value < 35)
                            {
                                failingSubjectsCount++;
                            }
                        }
                    }
                }
            }

            double? overallMarksAverage = subjectsWithDataCount > 0
                ? totalSubjectPercentageSum / subjectsWithDataCount
                : null;

            var context = new RiskEvaluationContext(
                attendancePercentage,
                overallMarksAverage,
                failingSubjectsCount,
                student.Behavior,
                student.Contribution is { Count: > 0 },
                missingSubjectsCount);
            var score = ScoringRules.Sum(rule => rule.Score(context));

            // Cap between 0 and 100
            double finalScore = Math.Max(0, Math.Min(score, 100));

            // Determine Risk Level
            string level = "low";
            if (finalScore <= 25)
            {
                level = "low";
            }
            else if (finalScore <= 50)
            {
                level = "medium";
            }
            else if (finalScore <= 75)
            {
                level = "high";
            }
            else
            {
                level = "critical";
            }

            return new RiskResult
            {
                RiskScore = finalScore,
                RiskLevel = level
            };
        }
    }
}
