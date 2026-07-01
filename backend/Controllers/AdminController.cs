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
    [Authorize(Roles = "admin")]
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly MongoService _mongoService;
        private readonly NvidiaNimService _nvidiaNimService;

        public AdminController(MongoService mongoService, NvidiaNimService nvidiaNimService)
        {
            _mongoService = mongoService;
            _nvidiaNimService = nvidiaNimService;
        }

        // --- MENTOR VERIFICATION SYSTEM ---

        [HttpGet("mentors/pending")]
        public async Task<IActionResult> GetPendingMentors()
        {
            var mentors = await _mongoService.Mentors.Find(m => m.Status == "pending_verification").ToListAsync();
            return Ok(new { success = true, data = mentors });
        }

        [HttpPost("mentors/{id}/status")]
        public async Task<IActionResult> UpdateMentorStatus(string id, [FromBody] UpdateStatusRequest request)
        {
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
            if (result.MatchedCount == 0)
            {
                return NotFound(new { success = false, message = "Mentor not found" });
            }

            return Ok(new { success = true, message = $"Mentor status updated to {request.Status}" });
        }

        [HttpPut("mentors/{id}")]
        public async Task<IActionResult> UpdateMentorDetails(string id, [FromBody] Mentor model)
        {
            if (model == null) return BadRequest(new { success = false, message = "Invalid body" });
            
            var existing = await _mongoService.Mentors.Find(m => m.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Mentor not found" });

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
            var result = await _mongoService.Mentors.DeleteOneAsync(m => m.Id == id);
            if (result.DeletedCount == 0) return NotFound(new { success = false, message = "Mentor not found" });
            return Ok(new { success = true, message = "Mentor deleted successfully" });
        }

        // --- COLLEGE MANAGEMENT ---

        [AllowAnonymous]
        [HttpGet("colleges")]
        public async Task<IActionResult> ListColleges()
        {
            var colleges = await _mongoService.Colleges.Find(_ => true).ToListAsync();
            return Ok(new { success = true, data = colleges });
        }

        [HttpPost("colleges")]
        public async Task<IActionResult> CreateCollege([FromBody] College model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name))
            {
                return BadRequest(new { success = false, message = "College Name is required" });
            }

            await _mongoService.Colleges.InsertOneAsync(model);
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

            var degrees = await _mongoService.Degrees.Find(filter).ToListAsync();
            return Ok(new { success = true, data = degrees });
        }

        [HttpPost("degrees")]
        public async Task<IActionResult> CreateDegree([FromBody] Degree model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.CollegeId))
            {
                return BadRequest(new { success = false, message = "Degree Name and CollegeId are required" });
            }

            await _mongoService.Degrees.InsertOneAsync(model);
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

            await _mongoService.Announcements.InsertOneAsync(model);
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

            await _mongoService.Events.InsertOneAsync(model);
            return Ok(new { success = true, data = model });
        }

        // --- STUDENT MANAGEMENT ---

        [HttpPost("students")]
        public async Task<IActionResult> AddStudent([FromBody] Student model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.RollNo))
            {
                return BadRequest(new { success = false, message = "Name and RollNo are required" });
            }

            model.IsVerified = true;
            model.VerificationStatus = "approved";
            await _mongoService.Students.InsertOneAsync(model);
            return Ok(new { success = true, data = model });
        }

        [HttpPut("students/{id}")]
        public async Task<IActionResult> UpdateStudent(string id, [FromBody] Student model)
        {
            if (model == null) return BadRequest(new { success = false, message = "Invalid body" });
            
            var existing = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (existing == null) return NotFound(new { success = false, message = "Student not found" });

            existing.Name = model.Name;
            existing.Email = model.Email;
            existing.RollNo = model.RollNo;
            existing.Class = model.Class;
            existing.Semester = model.Semester;
            existing.MentorId = model.MentorId;
            existing.CourseId = model.CourseId;
            existing.CollegeId = model.CollegeId;
            existing.Attendance = model.Attendance;
            existing.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Students.ReplaceOneAsync(s => s.Id == id, existing);
            return Ok(new { success = true, message = "Student updated successfully" });
        }

        [HttpDelete("students/{id}")]
        public async Task<IActionResult> DeleteStudent(string id)
        {
            var result = await _mongoService.Students.DeleteOneAsync(s => s.Id == id);
            if (result.DeletedCount == 0) return NotFound(new { success = false, message = "Student not found" });
            return Ok(new { success = true, message = "Student deleted successfully" });
        }

        // --- UNIVERSITY / BOARD INTEGRATION ---

        [AllowAnonymous]
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
    }

    public class UpdateStatusRequest
    {
        public string Status { get; set; } = string.Empty;
    }
}
