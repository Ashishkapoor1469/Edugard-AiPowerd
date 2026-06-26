using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using EduGuard.Hubs;
using EduGuard.Models;

namespace EduGuard.Services
{
    public class NotificationService
    {
        private readonly MongoService _mongoService;
        private readonly IHubContext<EduGuardHub> _hubContext;

        public NotificationService(MongoService mongoService, IHubContext<EduGuardHub> hubContext)
        {
            _mongoService = mongoService;
            _hubContext = hubContext;
        }

        public async Task CreateNotificationAsync(string mentorId, string studentId, string type, string messageStr, string priority = "low")
        {
            if (string.IsNullOrEmpty(mentorId) || string.IsNullOrEmpty(studentId)) return;

            // Duplicate protection: check if there's an unread notification of same type for this student within last 2 hours
            var twoHoursAgo = DateTime.UtcNow.AddHours(-2);
            var duplicateFilter = Builders<Notification>.Filter.And(
                Builders<Notification>.Filter.Eq(n => n.StudentId, studentId),
                Builders<Notification>.Filter.Eq(n => n.Type, type),
                Builders<Notification>.Filter.Eq(n => n.IsRead, false),
                Builders<Notification>.Filter.Gte(n => n.CreatedAt, twoHoursAgo)
            );

            var existing = await _mongoService.Notifications.Find(duplicateFilter).FirstOrDefaultAsync();

            Notification notification;
            if (existing != null)
            {
                // Update existing instead of creating duplicate
                var update = Builders<Notification>.Update
                    .Set(n => n.Message, messageStr)
                    .Set(n => n.Priority, priority)
                    .Set(n => n.UpdatedAt, DateTime.UtcNow);
                
                await _mongoService.Notifications.UpdateOneAsync(
                    Builders<Notification>.Filter.Eq(n => n.Id, existing.Id),
                    update
                );
                
                notification = await _mongoService.Notifications.Find(n => n.Id == existing.Id).FirstOrDefaultAsync();
            }
            else
            {
                // Create new
                notification = new Notification
                {
                    MentorId = mentorId,
                    StudentId = studentId,
                    Type = type,
                    Message = messageStr,
                    IsRead = false,
                    Priority = priority,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                await _mongoService.Notifications.InsertOneAsync(notification);

                // Add notification reference to Student document
                var studentUpdate = Builders<Student>.Update.Push(s => s.Notifications, notification.Id!);
                await _mongoService.Students.UpdateOneAsync(s => s.Id == studentId, studentUpdate);
            }

            if (notification != null)
            {
                // Emit real-time notification alert via SignalR to the mentor room (which matches mentorId)
                await _hubContext.Clients.Group(mentorId).SendAsync("notification", notification);
            }
        }

        public async Task CheckAndGenerateNotificationsAsync(Student student, Student? oldValues)
        {
            if (string.IsNullOrEmpty(student.MentorId)) return;

            // 1. Attendance Drop check
            if (student.Attendance.HasValue)
            {
                bool attendanceDropped = false;
                if (oldValues == null || !oldValues.Attendance.HasValue)
                {
                    attendanceDropped = student.Attendance.Value < 75;
                }
                else
                {
                    attendanceDropped = student.Attendance.Value < 75 && oldValues.Attendance.Value >= 75;
                }

                if (attendanceDropped)
                {
                    await CreateNotificationAsync(
                        student.MentorId,
                        student.Id!,
                        "attendance_drop",
                        $"Student {student.Name}'s attendance has dropped to {student.Attendance.Value:F1}% (below 75%).",
                        "high"
                    );
                }
            }

            // 2. Performance Marks Drop check
            var currentAvg = RiskEngine.CalculateSubjectAverage(new SubjectMarks { ClassTests = new(), SubjectName = "dummy" }); // not used this way, let's calculate overall
            double totalPercentage = 0;
            int subjectWithDataCount = 0;
            if (student.Marks != null)
            {
                foreach (var m in student.Marks)
                {
                    var avg = RiskEngine.CalculateSubjectAverage(m);
                    if (avg.HasValue)
                    {
                        totalPercentage += avg.Value;
                        subjectWithDataCount++;

                        // Check single subject failing drop
                        bool subjectFailed = avg.Value < 35;
                        bool wasSubjectFailedBefore = false;
                        if (oldValues != null && oldValues.Marks != null)
                        {
                            var oldM = oldValues.Marks.FirstOrDefault(x => string.Equals(x.SubjectName, m.SubjectName, StringComparison.OrdinalIgnoreCase));
                            if (oldM != null)
                            {
                                var oldAvg = RiskEngine.CalculateSubjectAverage(oldM);
                                wasSubjectFailedBefore = oldAvg.HasValue && oldAvg.Value < 35;
                            }
                        }

                        if (subjectFailed && !wasSubjectFailedBefore)
                        {
                            await CreateNotificationAsync(
                                student.MentorId,
                                student.Id!,
                                "marks_drop",
                                $"Student {student.Name} is failing in subject: {m.SubjectName} (score: {avg.Value:F1}%).",
                                "medium"
                            );
                        }
                    }
                }
            }

            double? currentOverallAvg = subjectWithDataCount > 0 ? totalPercentage / subjectWithDataCount : null;
            if (currentOverallAvg.HasValue)
            {
                double? oldOverallAvg = null;
                if (oldValues != null && oldValues.Marks != null)
                {
                    double oldTotal = 0;
                    int oldCount = 0;
                    foreach (var m in oldValues.Marks)
                    {
                        var avg = RiskEngine.CalculateSubjectAverage(m);
                        if (avg.HasValue)
                        {
                            oldTotal += avg.Value;
                            oldCount++;
                        }
                    }
                    if (oldCount > 0) oldOverallAvg = oldTotal / oldCount;
                }

                bool avgDropped = currentOverallAvg.Value < 50 && (!oldOverallAvg.HasValue || oldOverallAvg.Value >= 50);
                if (avgDropped)
                {
                    await CreateNotificationAsync(
                        student.MentorId,
                        student.Id!,
                        "marks_drop",
                        $"Student {student.Name}'s overall academic average has dropped below 50% (currently {currentOverallAvg.Value:F1}%).",
                        "high"
                    );
                }
            }

            // 3. Behavior change
            if (!string.IsNullOrEmpty(student.Behavior))
            {
                bool behaviorGotBad = string.Equals(student.Behavior, "bad", StringComparison.OrdinalIgnoreCase) && 
                    (oldValues == null || !string.Equals(oldValues.Behavior, "bad", StringComparison.OrdinalIgnoreCase));

                if (behaviorGotBad)
                {
                    await CreateNotificationAsync(
                        student.MentorId,
                        student.Id!,
                        "behavior_change",
                        $"Student {student.Name}'s conduct/behavior has been flagged as bad.",
                        "medium"
                    );
                }
            }

            // 4. Critical Alert / High Risk level change
            if (!string.IsNullOrEmpty(student.RiskLevel))
            {
                bool wentCritical = string.Equals(student.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase) &&
                    (oldValues == null || !string.Equals(oldValues.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase));
                
                bool wentHigh = string.Equals(student.RiskLevel, "high", StringComparison.OrdinalIgnoreCase) &&
                    (oldValues == null || (!string.Equals(oldValues.RiskLevel, "high", StringComparison.OrdinalIgnoreCase) && 
                                           !string.Equals(oldValues.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase)));

                if (wentCritical)
                {
                    await CreateNotificationAsync(
                        student.MentorId,
                        student.Id!,
                        "critical_alert",
                        $"CRITICAL ALERT: Student {student.Name} is at CRITICAL RISK level (score: {student.RiskScore}/100). Immediate action required.",
                        "urgent"
                    );
                }
                else if (wentHigh)
                {
                    await CreateNotificationAsync(
                        student.MentorId,
                        student.Id!,
                        "high_risk",
                        $"Student {student.Name} has risen to HIGH RISK level (score: {student.RiskScore}/100).",
                        "high"
                    );
                }
            }
        }
    }
}
