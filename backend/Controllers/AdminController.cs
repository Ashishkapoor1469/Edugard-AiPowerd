using System;
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
    [Authorize(Roles = "admin,college-admin")]
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly MongoService _mongoService;
        private readonly INvidiaNimService _nvidiaNimService;
        private readonly NotificationService _notificationService;
        private readonly ICacheService _cacheService;
        private readonly IPushAudienceNotifier _push;

        public AdminController(MongoService mongoService, INvidiaNimService nvidiaNimService, NotificationService notificationService, ICacheService cacheService, IPushAudienceNotifier push)
        {
            _mongoService = mongoService;
            _nvidiaNimService = nvidiaNimService;
            _notificationService = notificationService;
            _cacheService = cacheService;
            _push = push;
        }

        private bool IsSuperAdmin()
        {
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            return role == "admin";
        }

        private string? GetCollegeId()
        {
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            if (role == "college-admin")
            {
                var userId = User.FindFirst("id")?.Value;
                if (!string.IsNullOrEmpty(userId))
                {
                    var admin = _mongoService.Admins.Find(a => a.Id == userId).FirstOrDefault();
                    return admin?.CollegeId;
                }
            }
            return null;
        }

        // --- MENTOR VERIFICATION SYSTEM ---

        [HttpGet("mentors")]
        public async Task<IActionResult> GetCollegeMentors()
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();
            if (string.IsNullOrEmpty(collegeId))
            {
                return BadRequest(new { success = false, message = "College admin is not linked to a college" });
            }

            var mentors = await _mongoService.Mentors
                .Find(m => m.CollegeId == collegeId)
                .SortBy(m => m.Name)
                .ToListAsync();

            var mentorIds = mentors.Where(m => m.Id != null).Select(m => m.Id!).ToList();
            var assignedMentorIds = mentorIds.Count == 0
                ? new List<string?>()
                : await _mongoService.Students
                    .Find(Builders<Student>.Filter.In(s => s.MentorId, mentorIds))
                    .Project(s => s.MentorId)
                    .ToListAsync();
            var assignedCounts = assignedMentorIds
                .Where(id => !string.IsNullOrEmpty(id))
                .GroupBy(id => id!)
                .ToDictionary(group => group.Key, group => group.Count());

            var resultList = new List<object>();
            foreach (var mentor in mentors)
            {
                var assignedCount = mentor.Id != null && assignedCounts.TryGetValue(mentor.Id, out var count) ? count : 0;

                resultList.Add(new
                {
                    _id = mentor.Id,
                    id = mentor.Id,
                    name = mentor.Name,
                    email = mentor.Email,
                    department = mentor.Department,
                    batch = mentor.Batch,
                    semester = mentor.Semester,
                    status = mentor.Status,
                    maxStudents = mentor.MaxStudents,
                    assignedClasses = mentor.AssignedClasses,
                    assignedCount,
                    studentCount = assignedCount,
                    createdAt = mentor.CreatedAt,
                    updatedAt = mentor.UpdatedAt
                });
            }

            return Ok(new { success = true, data = resultList });
        }

        [HttpGet("mentors/pending")]
        public async Task<IActionResult> GetPendingMentors()
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();
            var mentors = await _mongoService.Mentors.Find(m => m.Status == "pending_verification" && m.CollegeId == collegeId).ToListAsync();
            return Ok(new { success = true, data = mentors });
        }

        [HttpPost("mentors/{id}/status")]
        public async Task<IActionResult> UpdateMentorStatus(string id, [FromBody] UpdateStatusRequest request)
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();
            var existing = await _mongoService.Mentors.Find(m => m.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Mentor not found" });
            if (existing.CollegeId != collegeId) return Forbid();

            if (request == null || string.IsNullOrEmpty(request.Status))
            {
                return BadRequest(new { success = false, message = "Status parameter is required" });
            }

            var validStatuses = new[] { "approved", "rejected", "disabled" };
            if (!validStatuses.Contains(request.Status.ToLower()))
            {
                return BadRequest(new { success = false, message = "Invalid status. Allowed: approved, rejected, disabled" });
            }

            var filter = Builders<Mentor>.Filter.Eq(m => m.Id, id);
            var update = Builders<Mentor>.Update.Set(m => m.Status, request.Status.ToLower()).Set(m => m.UpdatedAt, DateTime.UtcNow);
            
            var result = await _mongoService.Mentors.UpdateOneAsync(filter, update);
            return Ok(new { success = true, message = $"Mentor status updated to {request.Status}" });
        }

        [HttpPut("mentors/{id}")]
        public async Task<IActionResult> UpdateMentorDetails(string id, [FromBody] Mentor model)
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();
            var existing = await _mongoService.Mentors.Find(m => m.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Mentor not found" });
            if (existing.CollegeId != collegeId) return Forbid();

            if (model == null) return BadRequest(new { success = false, message = "Invalid body" });
            
            existing.Name = model.Name;
            existing.Email = model.Email;
            existing.AssignedCourseId = model.AssignedCourseId;
            existing.AssignedClasses = model.AssignedClasses;
            existing.Batch = model.Batch;
            existing.Department = model.Department;
            existing.Semester = model.Semester;
            existing.MaxStudents = model.MaxStudents;
            existing.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Mentors.ReplaceOneAsync(m => m.Id == id, existing);
            return Ok(new { success = true, message = "Mentor details updated successfully" });
        }

        [HttpDelete("mentors/{id}")]
        public async Task<IActionResult> DeleteMentor(string id)
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();
            var existing = await _mongoService.Mentors.Find(m => m.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Mentor not found" });
            if (existing.CollegeId != collegeId) return Forbid();

            await _mongoService.Mentors.DeleteOneAsync(m => m.Id == id);
            return Ok(new { success = true, message = "Mentor deleted successfully" });
        }

        // --- COLLEGE MANAGEMENT ---

        [AllowAnonymous]
        [HttpGet("colleges")]
        public async Task<IActionResult> ListColleges()
        {
            var colleges = await _cacheService.GetOrCreateAsync(
                "admin:colleges:all",
                TimeSpan.FromMinutes(10),
                () => _mongoService.Colleges.Find(_ => true).ToListAsync()
            );
            return Ok(new { success = true, data = colleges });
        }

        [HttpPost("colleges")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> CreateCollege([FromBody] College model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name))
            {
                return BadRequest(new { success = false, message = "College Name is required" });
            }

            await _mongoService.Colleges.InsertOneAsync(model);
            await _cacheService.RemoveAsync("admin:colleges:all");
            return Ok(new { success = true, data = model });
        }

        // --- DEGREE MANAGEMENT ---

        [AllowAnonymous]
        [HttpGet("degrees")]
        public async Task<IActionResult> ListDegrees([FromQuery] string? collegeId = null)
        {
            var filter = string.IsNullOrEmpty(collegeId) 
                ? Builders<Degree>.Filter.Empty 
                : Builders<Degree>.Filter.Eq(d => d.CollegeId, collegeId);

            var cacheKey = string.IsNullOrEmpty(collegeId) ? "admin:degrees:all" : $"admin:degrees:{collegeId}";
            var degrees = await _cacheService.GetOrCreateAsync(
                cacheKey,
                TimeSpan.FromMinutes(10),
                () => _mongoService.Degrees.Find(filter).ToListAsync()
            );

            return Ok(new { success = true, data = degrees });
        }


        [HttpPost("degrees")]
        public async Task<IActionResult> CreateDegree([FromBody] Degree model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.CollegeId))
            {
                return BadRequest(new { success = false, message = "Degree Name and CollegeId are required" });
            }
            if (!IsSuperAdmin())
            {
                var collegeId = GetCollegeId();
                if (string.IsNullOrEmpty(collegeId)) return Unauthorized();
                if (model.CollegeId != collegeId) return Forbid();
            }

            await _mongoService.Degrees.InsertOneAsync(model);
            await _cacheService.RemoveAsync("admin:degrees:all", $"admin:degrees:{model.CollegeId}");
            return Ok(new { success = true, data = model });
        }

        // --- ANNOUNCEMENT SYSTEM ---

        [HttpPost("announcements")]
        public async Task<IActionResult> CreateAnnouncement([FromBody] Announcement model)
        {
            if (model == null || string.IsNullOrEmpty(model.Title) || string.IsNullOrEmpty(model.CollegeId))
            {
                return BadRequest(new { success = false, message = "Title and CollegeId are required" });
            }
            if (!IsSuperAdmin() && model.CollegeId != GetCollegeId()) return Forbid();

            await _mongoService.Announcements.InsertOneAsync(model);
            await _push.NotifyCollegeAsync(model.CollegeId, model.TargetAudience, model.TargetAudience is "class" or "batch" ? model.TargetId : null,
                $"announcement:{model.Id}", new PushMessage(model.Title, model.Description, "normal",
                    new Dictionary<string, string> { ["type"] = "announcement", ["path"] = "/?tab=notifications" }));
            return Ok(new { success = true, data = model });
        }

        // --- EVENT SYSTEM ---

        [HttpPost("events")]
        public async Task<IActionResult> CreateEvent([FromBody] Event model)
        {
            if (model == null || string.IsNullOrEmpty(model.EventName) || string.IsNullOrEmpty(model.CollegeId))
            {
                return BadRequest(new { success = false, message = "Event Name and CollegeId are required" });
            }
            if (!IsSuperAdmin() && model.CollegeId != GetCollegeId()) return Forbid();

            await _mongoService.Events.InsertOneAsync(model);
            await _push.NotifyCollegeAsync(model.CollegeId, "all", null, $"event:{model.Id}",
                new PushMessage(model.EventName, model.Description, "normal",
                    new Dictionary<string, string> { ["type"] = "event", ["path"] = "/?tab=notifications" }));
            return Ok(new { success = true, data = model });
        }

        [HttpPost("students")]
        public async Task<IActionResult> AddStudent([FromBody] Student model)
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();

            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.RollNo))
            {
                return BadRequest(new { success = false, message = "Name and RollNo are required" });
            }

            model.CollegeId = collegeId!;
            model.IsVerified = true;
            model.VerificationStatus = "approved";
            model.IsRegistered = false; // waiting for self-registration signup
            await _mongoService.Students.InsertOneAsync(model);
            return Ok(new { success = true, data = model });
        }

        [HttpPut("students/{id}")]
        public async Task<IActionResult> UpdateStudent(string id, [FromBody] Student model)
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();

            if (model == null) return BadRequest(new { success = false, message = "Invalid body" });
            
            var existing = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Student not found" });
            if (existing.CollegeId != collegeId) return Forbid();

            // If mentor assignment is changing
            if (model.MentorId != existing.MentorId)
            {
                if (!string.IsNullOrEmpty(model.MentorId))
                {
                    // Validate mentor exists
                    var mentor = await _mongoService.Mentors.Find(m =>
                        m.Id == model.MentorId &&
                        m.CollegeId == collegeId &&
                        m.Status == "approved" &&
                        (string.IsNullOrEmpty(m.AssignedCourseId) || m.AssignedCourseId == model.CourseId)
                    ).FirstOrDefaultAsync();
                    if (mentor == null)
                    {
                        return NotFound(new { success = false, message = "Mentor not found" });
                    }

                    // Validate mentor capacity limit (max 30 students)
                    var currentCount = await _mongoService.Students.CountDocumentsAsync(s => s.MentorId == model.MentorId && s.Id != id);
                    if (currentCount >= 30)
                    {
                        return BadRequest(new { success = false, message = $"Mentor {mentor.Name} has reached their maximum capacity of 30 students" });
                    }

                    // Send notification to student and mentor
                    await _notificationService.CreateNotificationAsync(
                        model.MentorId,
                        id,
                        "mentor_assigned",
                        $"Mentor {mentor.Name} has been assigned to student {existing.Name}.",
                        "medium"
                    );

                    existing.MentorName = mentor.Name;
                }
                else
                {
                    existing.MentorName = null;
                }
            }

            existing.Name = model.Name;
            existing.Email = model.Email;
            existing.RollNo = model.RollNo;
            existing.Class = model.Class;
            existing.Semester = model.Semester;
            existing.MentorId = model.MentorId;
            existing.CourseId = model.CourseId;
            existing.Attendance = model.Attendance;
            existing.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Students.ReplaceOneAsync(s => s.Id == id, existing);
            return Ok(new { success = true, message = "Student updated successfully" });
        }

        [HttpDelete("students/{id}")]
        public async Task<IActionResult> DeleteStudent(string id)
        {
            if (IsSuperAdmin()) return Forbid();
            var collegeId = GetCollegeId();

            var existing = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Student not found" });
            if (existing.CollegeId != collegeId) return Forbid();

            await _mongoService.Students.DeleteOneAsync(s => s.Id == id);
            return Ok(new { success = true, message = "Student deleted successfully" });
        }



        // --- UNIVERSITY / BOARD INTEGRATION ---

        [Authorize(Roles = "admin,college-admin")]
        [HttpGet("university/syllabus-auto")]
        public async Task<IActionResult> AutoFetchSyllabus([FromQuery] string university, [FromQuery] string course)
        {
            if (string.IsNullOrEmpty(university) || string.IsNullOrEmpty(course))
            {
                return BadRequest(new { success = false, message = "University and Course parameters are required" });
            }

            try
            {
                // Query NVIDIA NIM AI to fetch the course details and subjects dynamically
                var syllabusMarkdown = await _nvidiaNimService.GenerateSyllabusDataAsync(university, course);
                return Ok(new { success = true, data = syllabusMarkdown });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Failed to auto-fetch syllabus: {ex.Message}" });
            }
        }

        // --- COLLEGE ADMIN & BLOCKING ENHANCEMENTS ---

        [Authorize(Roles = "admin")]
        [HttpPost("colleges/{id}/block")]
        public async Task<IActionResult> BlockCollege(string id, [FromQuery] bool block)
        {
            var filter = Builders<College>.Filter.Eq(c => c.Id, id);
            var update = Builders<College>.Update.Set(c => c.IsBlocked, block).Set(c => c.UpdatedAt, DateTime.UtcNow);
            var result = await _mongoService.Colleges.UpdateOneAsync(filter, update);
            if (result.MatchedCount == 0) return NotFound(new { success = false, message = "College not found" });
            await _cacheService.RemoveAsync("admin:colleges:all");
            return Ok(new { success = true, message = $"College successfully {(block ? "blocked" : "unblocked")}" });
        }

        [Authorize(Roles = "admin")]
        [HttpPut("colleges/{id}")]
        public async Task<IActionResult> UpdateCollegeDetails(string id, [FromBody] College model)
        {
            if (model == null) return BadRequest("Invalid body");
            var existing = await _mongoService.Colleges.Find(c => c.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound("College not found");

            existing.Name = model.Name;
            existing.Location = model.Location;
            existing.Address = model.Address;
            existing.Website = model.Website;
            existing.ContactInfo = model.ContactInfo;
            if (!string.IsNullOrWhiteSpace(model.TimeZone)) existing.TimeZone = model.TimeZone.Trim();
            existing.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Colleges.ReplaceOneAsync(c => c.Id == id, existing);
            await _cacheService.RemoveAsync("admin:colleges:all");
            return Ok(new { success = true, message = "College details updated successfully" });
        }

        [Authorize(Roles = "admin")]
        [HttpPost("college-admins")]
        public async Task<IActionResult> RegisterCollegeAdmin([FromBody] Admin model)
        {
            if (model == null || string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Password) || string.IsNullOrEmpty(model.CollegeId))
            {
                return BadRequest(new { success = false, message = "Email, password, and CollegeId are required" });
            }

            // Validate college exists
            var college = await _mongoService.Colleges.Find(c => c.Id == model.CollegeId).FirstOrDefaultAsync();
            if (college == null)
            {
                return BadRequest(new { success = false, message = "Selected college does not exist" });
            }

            model.Email = model.Email.Trim().ToLower();
            var existing = await _mongoService.Admins.Find(a => a.Email == model.Email).FirstOrDefaultAsync();
            if (existing != null)
            {
                return BadRequest(new { success = false, message = "Email is already registered" });
            }

            model.Password = BCrypt.Net.BCrypt.HashPassword(model.Password);
            model.Role = "college-admin";
            model.IsCollegeAdmin = true;
            model.IsSuperAdmin = false;
            model.CreatedAt = DateTime.UtcNow;
            model.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Admins.InsertOneAsync(model);
            return StatusCode(201, new { success = true, message = "College Admin account registered successfully!" });
        }

        [Authorize(Roles = "admin")]
        [HttpGet("colleges/stats")]
        public async Task<IActionResult> GetCollegeStats()
        {
            var colleges = await _mongoService.Colleges.Find(_ => true).ToListAsync();
            var mentorCollegeIds = await _mongoService.Mentors.Find(_ => true).Project(m => m.CollegeId).ToListAsync();
            var studentCollegeIds = await _mongoService.Students.Find(_ => true).Project(s => s.CollegeId).ToListAsync();
            var collegeAccounts = await _mongoService.Admins
                .Find(a => (a.Role == "college-admin" || a.Role == "librarian") && a.Status != "deleted")
                .Project(a => new { a.CollegeId, a.Role })
                .ToListAsync();
            var mentorCounts = mentorCollegeIds.Where(id => !string.IsNullOrEmpty(id)).GroupBy(id => id!).ToDictionary(group => group.Key, group => group.Count());
            var studentCounts = studentCollegeIds.Where(id => !string.IsNullOrEmpty(id)).GroupBy(id => id!).ToDictionary(group => group.Key, group => group.Count());
            var collegeAdminCounts = collegeAccounts.Where(a => a.Role == "college-admin" && !string.IsNullOrEmpty(a.CollegeId)).GroupBy(a => a.CollegeId!).ToDictionary(group => group.Key, group => group.Count());
            var librarianCounts = collegeAccounts.Where(a => a.Role == "librarian" && !string.IsNullOrEmpty(a.CollegeId)).GroupBy(a => a.CollegeId!).ToDictionary(group => group.Key, group => group.Count());
            var statsList = new List<object>();

            foreach (var college in colleges)
            {
                var mentorCount = college.Id != null && mentorCounts.TryGetValue(college.Id, out var mentors) ? mentors : 0;
                var studentCount = college.Id != null && studentCounts.TryGetValue(college.Id, out var students) ? students : 0;
                var collegeAdminCount = college.Id != null && collegeAdminCounts.TryGetValue(college.Id, out var collegeAdmins) ? collegeAdmins : 0;
                var librarianCount = college.Id != null && librarianCounts.TryGetValue(college.Id, out var librarians) ? librarians : 0;

                statsList.Add(new
                {
                    collegeId = college.Id,
                    collegeName = college.Name,
                    location = college.Location,
                    isBlocked = college.IsBlocked,
                    mentorsCount = mentorCount,
                    studentsCount = studentCount,
                    collegeAdminsCount = collegeAdminCount,
                    librariansCount = librarianCount
                });
            }

            return Ok(new { success = true, data = statsList });
        }
    }

    public class UpdateStatusRequest
    {
        public string Status { get; set; } = string.Empty;
    }
}
