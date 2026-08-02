using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/mentors")]
    public class MentorController : ControllerBase
    {
        private readonly MongoService _mongoService;

        public MentorController(MongoService mongoService)
        {
            _mongoService = mongoService;
        }

        [AllowAnonymous]
        [HttpGet("list")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetMentorsList([FromQuery] string? collegeId = null, [FromQuery] string? courseId = null)
        {
            var filters = new List<FilterDefinition<Mentor>>
            {
                Builders<Mentor>.Filter.Eq(m => m.Status, "approved")
            };

            if (!string.IsNullOrWhiteSpace(collegeId))
            {
                filters.Add(Builders<Mentor>.Filter.Eq(m => m.CollegeId, collegeId));
            }

            if (!string.IsNullOrWhiteSpace(courseId))
            {
                filters.Add(Builders<Mentor>.Filter.Eq(m => m.AssignedCourseId, courseId));
            }

            var filter = Builders<Mentor>.Filter.And(filters);
            var mentors = await _mongoService.Mentors.Find(filter).SortBy(m => m.Name).ToListAsync();
            var resultList = new List<object>();

            foreach (var mentor in mentors)
            {
                var assignedCount = await _mongoService.Students.CountDocumentsAsync(s => s.MentorId == mentor.Id);

                resultList.Add(new
                {
                    _id = mentor.Id,
                    id = mentor.Id,
                    name = mentor.Name,
                    email = mentor.Email,
                    role = mentor.Role,
                    isOnline = mentor.IsOnline,
                    collegeId = mentor.CollegeId,
                    assignedCourseId = mentor.AssignedCourseId,
                    department = mentor.Department,
                    status = mentor.Status,
                    assignedClasses = mentor.AssignedClasses,
                    assignedCount,
                    studentCount = assignedCount,
                    maxStudents = mentor.MaxStudents,
                    capacity = mentor.MaxStudents
                });
            }

            return Ok(new { success = true, data = resultList });
        }

        // --- MENTOR ALERTS: Announcements + Events for their college ---
        [HttpGet("my-alerts")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetMyAlerts()
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { success = false, message = "Not authenticated" });

            var mentor = await _mongoService.Mentors.Find(m => m.Id == userId).FirstOrDefaultAsync();
            if (mentor == null)
                return NotFound(new { success = false, message = "Mentor not found" });

            var collegeId = mentor.CollegeId;
            var results = new System.Collections.Generic.List<object>();
            var cutoff = System.DateTime.UtcNow.AddDays(-15);

            if (!string.IsNullOrEmpty(collegeId))
            {
                var announcements = await _mongoService.Announcements
                    .Find(a => a.CollegeId == collegeId && a.CreatedAt >= cutoff)
                    .SortByDescending(a => a.CreatedAt)
                    .Limit(50)
                    .ToListAsync();

                foreach (var a in announcements)
                {
                    if (a.ExpiryDate.HasValue && a.ExpiryDate.Value < System.DateTime.UtcNow) continue;

                    results.Add(new
                    {
                        _id = a.Id,
                        type = "announcement",
                        title = a.Title,
                        message = a.Description,
                        targetAudience = a.TargetAudience,
                        createdAt = a.CreatedAt
                    });
                }

                var events = await _mongoService.Events
                    .Find(e => e.CollegeId == collegeId && e.CreatedAt >= cutoff)
                    .SortByDescending(e => e.CreatedAt)
                    .Limit(50)
                    .ToListAsync();

                foreach (var ev in events)
                {
                    results.Add(new
                    {
                        _id = ev.Id,
                        type = "event",
                        title = ev.EventName,
                        message = ev.Description,
                        date = ev.Date,
                        location = ev.Location,
                        registrationLink = ev.RegistrationLink,
                        createdAt = ev.CreatedAt
                    });
                }
            }

            results = results.OrderByDescending(r => ((dynamic)r).createdAt).Take(10).ToList();

            return Ok(new { success = true, data = results });
        }
    }
}
