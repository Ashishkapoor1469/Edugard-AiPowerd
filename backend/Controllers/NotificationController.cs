using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Controllers
{
    [Authorize(Roles = "mentor")]
    [ApiController]
    [Route("api/notifications")]
    public class NotificationController : ControllerBase
    {
        private readonly MongoService _mongoService;

        public NotificationController(MongoService mongoService)
        {
            _mongoService = mongoService;
        }

        [HttpGet]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetNotifications([FromQuery] bool? isRead = null, [FromQuery] string? type = null)
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "User ID not found in claims" });
            }

            // Fetch notifications for the logged in mentor, sorted by newest first
            var filters = new List<FilterDefinition<Notification>>
            {
                Builders<Notification>.Filter.Eq(n => n.MentorId, userId),
                Builders<Notification>.Filter.Gte(n => n.CreatedAt, DateTime.UtcNow.AddDays(-15))
            };
            if (isRead.HasValue)
            {
                filters.Add(Builders<Notification>.Filter.Eq(n => n.IsRead, isRead.Value));
            }
            if (!string.IsNullOrWhiteSpace(type))
            {
                filters.Add(Builders<Notification>.Filter.Eq(n => n.Type, type));
            }

            var filter = Builders<Notification>.Filter.And(filters);
            var notifications = await _mongoService.Notifications
                .Find(filter)
                .SortByDescending(n => n.CreatedAt)
                .Limit(10)
                .ToListAsync();

            var studentIds = notifications
                .Select(n => n.StudentId)
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct()
                .ToList();
            var students = studentIds.Count == 0
                ? new List<Student>()
                : await _mongoService.Students.Find(s => studentIds.Contains(s.Id!)).ToListAsync();
            var studentsById = students
                .Where(s => !string.IsNullOrEmpty(s.Id))
                .ToDictionary(s => s.Id!, s => s);

            var data = notifications.Select(n =>
            {
                studentsById.TryGetValue(n.StudentId, out var student);
                return new
                {
                    _id = n.Id,
                    n.Type,
                    n.Message,
                    n.IsRead,
                    n.Priority,
                    n.CreatedAt,
                    n.UpdatedAt,
                    mentorId = n.MentorId,
                    studentId = student == null
                        ? n.StudentId as object
                        : new
                        {
                            _id = student.Id,
                            student.Name,
                            student.RollNo,
                            student.Class
                        }
                };
            });

            return Ok(new { success = true, data });
        }

        [HttpPut("{id}/read")]
        [HttpPatch("{id}/read")]
        public async Task<IActionResult> MarkAsRead(string id)
        {
            var filter = Builders<Notification>.Filter.Eq(n => n.Id, id);
            var update = Builders<Notification>.Update
                .Set(n => n.IsRead, true)
                .Set(n => n.UpdatedAt, DateTime.UtcNow);

            var result = await _mongoService.Notifications.UpdateOneAsync(filter, update);
            if (result.MatchedCount == 0)
            {
                return NotFound(new { success = false, message = "Notification not found" });
            }

            return Ok(new { success = true, message = "Notification marked as read" });
        }

        [HttpPatch("read-all")]
        public async Task<IActionResult> MarkAllAsRead()
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "User ID not found in claims" });
            }

            var filter = Builders<Notification>.Filter.Eq(n => n.MentorId, userId);
            var update = Builders<Notification>.Update
                .Set(n => n.IsRead, true)
                .Set(n => n.UpdatedAt, DateTime.UtcNow);

            var result = await _mongoService.Notifications.UpdateManyAsync(filter, update);
            return Ok(new { success = true, modified = result.ModifiedCount });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteNotification(string id)
        {
            var result = await _mongoService.Notifications.DeleteOneAsync(n => n.Id == id);
            if (result.DeletedCount == 0)
            {
                return NotFound(new { success = false, message = "Notification not found" });
            }

            return Ok(new { success = true, message = "Notification deleted" });
        }
    }
}
