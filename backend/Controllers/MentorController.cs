using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

        [HttpGet("list")]
        public async Task<IActionResult> GetMentorsList()
        {
            var mentors = await _mongoService.Mentors.Find(_ => true).ToListAsync();
            var resultList = new List<object>();

            foreach (var mentor in mentors)
            {
                // Count current students assigned to this mentor
                var assignedCount = await _mongoService.Students.CountDocumentsAsync(s => s.MentorId == mentor.Id);

                resultList.Add(new
                {
                    _id = mentor.Id,
                    id = mentor.Id,
                    name = mentor.Name,
                    email = mentor.Email,
                    role = mentor.Role,
                    isOnline = mentor.IsOnline,
                    assignedClasses = mentor.AssignedClasses,
                    assignedCount,
                    studentCount = assignedCount,
                    capacity = 30
                });
            }

            return Ok(new { success = true, data = resultList });
        }

        // --- MENTOR ALERTS: Announcements + Events for their college ---
        [HttpGet("my-alerts")]
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

            if (!string.IsNullOrEmpty(collegeId))
            {
                var announcements = await _mongoService.Announcements
                    .Find(a => a.CollegeId == collegeId)
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
                    .Find(e => e.CollegeId == collegeId)
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

            results = results.OrderByDescending(r => ((dynamic)r).createdAt).ToList();

            return Ok(new { success = true, data = results });
        }
    }
}
