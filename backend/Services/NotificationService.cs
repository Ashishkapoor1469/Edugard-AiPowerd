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
        private readonly IPushNotificationQueue _pushQueue;
        private readonly IReadOnlyList<INotificationTriggerRule> _triggerRules;

        public NotificationService(MongoService mongoService, IHubContext<EduGuardHub> hubContext, IPushNotificationQueue pushQueue, IEnumerable<INotificationTriggerRule> triggerRules)
        {
            _mongoService = mongoService;
            _hubContext = hubContext;
            _pushQueue = pushQueue;
            _triggerRules = triggerRules.ToList();
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
            foreach (var trigger in _triggerRules.SelectMany(rule => rule.Evaluate(student, oldValues)))
            {
                await CreateNotificationAsync(student.MentorId, student.Id!, trigger.Type, trigger.Message, trigger.Priority);
                if (trigger.PushTitle != null) await EnqueueRiskPushAsync(student, trigger.PushTitle, student.MentorId);
            }
        }

        private async Task EnqueueRiskPushAsync(Student student, string title, string mentorId)
        {
            var message = new PushMessage(title, $"{student.Name} is now {student.RiskLevel} risk.", "important",
                new Dictionary<string, string> { ["type"] = "risk", ["path"] = $"/students/{student.Id}", ["studentId"] = student.Id! });
            var key = $"risk:{student.Id}:{student.RiskLevel}:{student.UpdatedAt.Ticks}";
            await _pushQueue.EnqueueAsync(student.Id!, key + ":student", message);
            await _pushQueue.EnqueueAsync(mentorId, key + ":mentor", message);
        }
    }
}
