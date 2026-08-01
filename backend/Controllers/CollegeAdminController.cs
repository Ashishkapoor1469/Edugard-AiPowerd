using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Controllers
{
    [Authorize(Roles = "college-admin")]
    [ApiController]
    [Route("api/college-admin")]
    public class CollegeAdminController : ControllerBase
    {
        private readonly MongoService _mongoService;
        private readonly ExcelParserService _excelParserService;
        private readonly ICacheService _cacheService;
        private readonly IPushAudienceNotifier _push;

        public CollegeAdminController(MongoService mongoService, ExcelParserService excelParserService, ICacheService cacheService, IPushAudienceNotifier push)
        {
            _mongoService = mongoService;
            _excelParserService = excelParserService;
            _cacheService = cacheService;
            _push = push;
        }

        private async Task<string?> GetCollegeIdAsync()
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId)) return null;

            var admin = await _mongoService.Admins.Find(a => a.Id == userId).FirstOrDefaultAsync();
            return admin?.CollegeId;
        }

        // --- ANNOUNCEMENTS SCOPED TO COLLEGE ---

        [HttpPost("announcements")]
        public async Task<IActionResult> CreateAnnouncement([FromBody] Announcement model)
        {
            var collegeId = await GetCollegeIdAsync();
            if (string.IsNullOrEmpty(collegeId))
            {
                return Unauthorized(new { success = false, message = "College ID not found for this administrator account." });
            }

            if (model == null || string.IsNullOrEmpty(model.Title))
            {
                return BadRequest(new { success = false, message = "Announcement Title is required" });
            }

            model.CollegeId = collegeId;
            model.CreatedAt = DateTime.UtcNow;
            model.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Announcements.InsertOneAsync(model);
            await _push.NotifyCollegeAsync(collegeId, model.TargetAudience, model.TargetAudience is "class" or "batch" ? model.TargetId : null,
                $"announcement:{model.Id}", new PushMessage(model.Title, model.Description, "normal",
                    new Dictionary<string, string> { ["type"] = "announcement", ["path"] = "/?tab=notifications" }));
            return Ok(new { success = true, data = model });
        }

        // --- EVENTS SCOPED TO COLLEGE ---

        [HttpPost("events")]
        public async Task<IActionResult> CreateEvent([FromBody] Event model)
        {
            var collegeId = await GetCollegeIdAsync();
            if (string.IsNullOrEmpty(collegeId))
            {
                return Unauthorized(new { success = false, message = "College ID not found for this administrator account." });
            }

            if (model == null || string.IsNullOrEmpty(model.EventName))
            {
                return BadRequest(new { success = false, message = "Event Name is required" });
            }

            model.CollegeId = collegeId;
            model.CreatedAt = DateTime.UtcNow;
            model.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Events.InsertOneAsync(model);
            await _push.NotifyCollegeAsync(collegeId, "all", null, $"event:{model.Id}",
                new PushMessage(model.EventName, model.Description, "normal",
                    new Dictionary<string, string> { ["type"] = "event", ["path"] = "/?tab=notifications" }));
            return Ok(new { success = true, data = model });
        }

        // --- UNIVERSITY SYLLABUS UPLOAD & FETCH ---

        [HttpPost("syllabus/upload")]
        public async Task<IActionResult> UploadSyllabus([FromForm] IFormFile file, [FromForm] string course)
        {
            var collegeId = await GetCollegeIdAsync();
            if (string.IsNullOrEmpty(collegeId))
            {
                return Unauthorized(new { success = false, message = "College ID not found for this administrator account." });
            }

            if (file == null || file.Length == 0)
            {
                return BadRequest(new { success = false, message = "Please upload an Excel file" });
            }

            if (string.IsNullOrEmpty(course))
            {
                return BadRequest(new { success = false, message = "Course parameter is required" });
            }

            course = course.Trim().ToUpper();

            try
            {
                using (var stream = file.OpenReadStream())
                {
                    var parsedRows = _excelParserService.ParseSyllabus(stream);
                    if (parsedRows == null || parsedRows.Count == 0)
                    {
                        return BadRequest(new { success = false, message = "No valid syllabus subjects found in the Excel spreadsheet. Validate column headers." });
                    }

                    var subjects = new List<SyllabusSubject>();
                    foreach (var row in parsedRows)
                    {
                        subjects.Add(new SyllabusSubject
                        {
                            Semester = row.Semester,
                            SubjectCode = row.SubjectCode,
                            SubjectName = row.SubjectName,
                            Credits = row.Credits,
                            Description = row.Description
                        });
                    }

                    // Look up if syllabus already exists
                    var filter = Builders<Syllabus>.Filter.Eq(s => s.CollegeId, collegeId) &
                                 Builders<Syllabus>.Filter.Eq(s => s.Course, course);

                    var existing = await _mongoService.Syllabi.Find(filter).FirstOrDefaultAsync();

                    if (existing != null)
                    {
                        existing.Subjects = subjects;
                        existing.UpdatedAt = DateTime.UtcNow;
                        await _mongoService.Syllabi.ReplaceOneAsync(filter, existing);
                    }
                    else
                    {
                        var newSyllabus = new Syllabus
                        {
                            CollegeId = collegeId,
                            Course = course,
                            Subjects = subjects,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        };
                        await _mongoService.Syllabi.InsertOneAsync(newSyllabus);
                    }

                    await _cacheService.RemoveAsync($"college-admin:syllabus:{collegeId}:{course}");
                    return Ok(new { success = true, message = $"Syllabus for {course} successfully uploaded & processed!" });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Failed to parse Excel: {ex.Message}" });
            }
        }

        [AllowAnonymous]
        [HttpGet("syllabus")]
        public async Task<IActionResult> GetSyllabus([FromQuery] string collegeId, [FromQuery] string course)
        {
            if (string.IsNullOrEmpty(collegeId) || string.IsNullOrEmpty(course))
            {
                return BadRequest(new { success = false, message = "College ID and Course parameters are required" });
            }

            course = course.Trim().ToUpper();
            var filter = Builders<Syllabus>.Filter.Eq(s => s.CollegeId, collegeId) &
                         Builders<Syllabus>.Filter.Eq(s => s.Course, course);

            var syllabus = await _cacheService.GetOrCreateAsync(
                $"college-admin:syllabus:{collegeId}:{course}",
                TimeSpan.FromMinutes(30),
                () => _mongoService.Syllabi.Find(filter).FirstOrDefaultAsync()
            );
            if (syllabus == null)
            {
                return NotFound(new { success = false, message = $"No syllabus found for {course} in this college." });
            }

            return Ok(new { success = true, data = syllabus });
        }
    }
}
