using System.Security.Claims;
using EduGuard.Models;
using EduGuard.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Bson;
using MongoDB.Driver;

namespace EduGuard.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/attendance")]
    public class AttendanceController : ControllerBase
    {
        private readonly MongoService _mongo;

        public AttendanceController(MongoService mongo) => _mongo = mongo;

        private string? UserId => User.FindFirst("id")?.Value;
        private string? Role => User.FindFirst(ClaimTypes.Role)?.Value;

        private async Task<(string? AdminId, string? CollegeId)> AdminScopeAsync()
        {
            if (Role != "college-admin" || string.IsNullOrEmpty(UserId)) return (null, null);
            var admin = await _mongo.Admins.Find(a => a.Id == UserId && a.Role == "college-admin" && a.Status == "active").FirstOrDefaultAsync();
            return (admin?.Id, admin?.CollegeId);
        }

        private async Task<LeadershipAssignment?> ActiveCrAsync(string studentId)
        {
            var now = DateTime.UtcNow;
            return await _mongo.LeadershipAssignments.Find(a =>
                a.StudentId == studentId && a.IsActive && a.LeadershipType == "CR" &&
                a.StartDate <= now && (!a.EndDate.HasValue || a.EndDate > now)).FirstOrDefaultAsync();
        }

        private async Task RecalculateAttendanceAsync(IEnumerable<Student> students)
        {
            var roster = students.ToList();
            if (roster.Count == 0) return;

            var ids = roster.Select(s => s.Id!).ToList();
            var records = await _mongo.AttendanceRecords.Find(a => ids.Contains(a.StudentId)).ToListAsync();
            var grouped = records.GroupBy(a => a.StudentId).ToDictionary(g => g.Key, g => g.ToList());
            var writes = new List<WriteModel<Student>>();

            foreach (var student in roster)
            {
                if (!grouped.TryGetValue(student.Id!, out var attendance) || attendance.Count == 0) continue;
                student.SessionAttendancePercentage = Math.Round(attendance.Count(a => a.Status == "present") * 100d / attendance.Count, 2);
                var risk = RiskEngine.CalculateRisk(student);
                student.RiskScore = risk.RiskScore;
                student.RiskLevel = risk.RiskLevel;
                student.RiskExplanation = string.Empty;
                student.AiImprovementPlan = string.Empty;
                student.UpdatedAt = DateTime.UtcNow;
                writes.Add(new ReplaceOneModel<Student>(Builders<Student>.Filter.Eq(s => s.Id, student.Id), student));
            }

            if (writes.Count > 0) await _mongo.Students.BulkWriteAsync(writes);
        }

        [HttpGet("context")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> Context()
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            var student = await _mongo.Students.Find(s => s.Id == UserId).FirstOrDefaultAsync();
            if (student == null) return NotFound(new { success = false, message = "Student not found" });

            var assignment = await ActiveCrAsync(student.Id!);
            var college = !string.IsNullOrEmpty(student.CollegeId)
                ? await _mongo.Colleges.Find(c => c.Id == student.CollegeId).FirstOrDefaultAsync()
                : null;
            var localNow = AttendanceRules.CollegeNow(college?.TimeZone ?? "Asia/Kolkata");
            var currentSession = AttendanceRules.CurrentSession(localNow);
            var isCr = assignment != null && assignment.CollegeId == student.CollegeId && assignment.ClassId == student.Class;
            var roster = isCr
                ? await _mongo.Students.Find(StudentRosterRules.Active(student.CollegeId!, assignment!.ClassId)).ToListAsync()
                : new List<Student>();
            var date = localNow.ToString("yyyy-MM-dd");
            var recentRecords = isCr
                ? await _mongo.AttendanceRecords.Find(a => a.CollegeId == student.CollegeId && a.ClassId == assignment!.ClassId && a.Date == date && a.MarkedBy == student.Id).ToListAsync()
                : new List<AttendanceRecord>();
            var recentSubmission = recentRecords.GroupBy(a => a.Session).OrderByDescending(g => g.Max(a => a.CreatedAt)).FirstOrDefault();
            var submittedAt = recentSubmission?.Max(a => a.CreatedAt);
            var currentAlreadySubmitted = currentSession != null && recentRecords.Any(a => a.Session == currentSession);

            return Ok(new
            {
                success = true,
                data = new
                {
                    isCr,
                    assignment,
                    canMark = isCr && currentSession != null && !currentAlreadySubmitted,
                    canUpdate = submittedAt.HasValue && submittedAt.Value >= DateTime.UtcNow.AddMinutes(-15) && (currentSession == null || recentSubmission?.Key == currentSession),
                    submittedAt,
                    submittedSession = recentSubmission?.Key,
                    submittedRecords = recentSubmission?.Select(a => new { studentId = a.StudentId, a.Status }) ?? Enumerable.Empty<object>(),
                    currentSession,
                    collegeTime = localNow,
                    timeZone = college?.TimeZone ?? "Asia/Kolkata",
                    roster = roster.Select(s => new { _id = s.Id, s.Name, s.RollNo, classId = s.Class })
                }
            });
        }

        [HttpGet("cr/refresh")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("attendance-refresh")]
        public Task<IActionResult> Refresh() => Context();

        [HttpPost("mark")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("attendance-finalize")]
        public async Task<IActionResult> Mark([FromBody] MarkAttendanceRequest request)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (request == null || string.IsNullOrWhiteSpace(request.Session) || request.Records == null)
                return BadRequest(new { success = false, message = "Session and full roster records are required" });
            var marker = await _mongo.Students.Find(s => s.Id == UserId).FirstOrDefaultAsync();
            var assignment = marker == null ? null : await ActiveCrAsync(marker.Id!);
            if (marker == null || assignment == null || assignment.CollegeId != marker.CollegeId || assignment.ClassId != marker.Class)
                return Forbid();

            var session = request.Session.Trim().ToLowerInvariant();
            if (session is not ("morning" or "afternoon"))
                return BadRequest(new { success = false, message = "Session must be morning or afternoon" });

            var college = await _mongo.Colleges.Find(c => c.Id == marker.CollegeId).FirstOrDefaultAsync();
            var localNow = AttendanceRules.CollegeNow(college?.TimeZone ?? "Asia/Kolkata");
            if (AttendanceRules.CurrentSession(localNow) != session)
                return StatusCode(403, new { success = false, message = "Attendance can only be marked during the active college session window" });

            var roster = await _mongo.Students.Find(StudentRosterRules.Active(marker.CollegeId!, assignment.ClassId)).ToListAsync();
            var rosterIds = roster.Select(s => s.Id!).OrderBy(id => id).ToArray();
            var submittedIds = request.Records.Select(r => r.StudentId).OrderBy(id => id).ToArray();
            if (rosterIds.Length == 0 || rosterIds.Length != submittedIds.Distinct().Count() || !rosterIds.SequenceEqual(submittedIds))
                return BadRequest(new { success = false, message = "A status for every active roster student is required" });
            if (request.Records.Any(r => r.Status.Trim().ToLowerInvariant() is not ("present" or "absent" or "leave")))
                return BadRequest(new { success = false, message = "Each status must be present, absent, or leave" });

            var date = localNow.ToString("yyyy-MM-dd");
            var alreadyFinalized = await _mongo.AttendanceRecords.Find(a =>
                a.CollegeId == marker.CollegeId && a.ClassId == assignment.ClassId && a.Date == date && a.Session == session).AnyAsync();
            if (alreadyFinalized) return Conflict(new { success = false, message = "This attendance session is already finalized; ask a college admin to correct it" });

            var now = DateTime.UtcNow;
            var records = request.Records.Select(r => new AttendanceRecord
            {
                StudentId = r.StudentId,
                CollegeId = marker.CollegeId!,
                ClassId = assignment.ClassId,
                Date = date,
                Session = session,
                Status = r.Status.Trim().ToLowerInvariant(),
                MarkedBy = marker.Id!,
                CreatedAt = now,
                UpdatedAt = now
            }).ToList();

            try { await _mongo.AttendanceRecords.InsertManyAsync(records, new InsertManyOptions { IsOrdered = true }); }
            catch (MongoBulkWriteException) { return Conflict(new { success = false, message = "This attendance session was already submitted" }); }

            await RecalculateAttendanceAsync(roster);
            return Ok(new { success = true, data = new { date, session, total = records.Count } });
        }

        [HttpPatch("change")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("attendance-writes")]
        public async Task<IActionResult> Change([FromBody] MarkAttendanceRequest request)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            var marker = await _mongo.Students.Find(s => s.Id == UserId).FirstOrDefaultAsync();
            var assignment = marker == null ? null : await ActiveCrAsync(marker.Id!);
            if (marker == null || assignment == null || assignment.CollegeId != marker.CollegeId || assignment.ClassId != marker.Class) return Forbid();

            var session = request?.Session?.Trim().ToLowerInvariant();
            if (session is not ("morning" or "afternoon") || request!.Records == null) return BadRequest(new { success = false, message = "A valid session and full roster are required" });
            var roster = await _mongo.Students.Find(StudentRosterRules.Active(marker.CollegeId!, assignment.ClassId)).ToListAsync();
            var rosterIds = roster.Select(s => s.Id!).OrderBy(id => id).ToArray();
            var submittedIds = request.Records.Select(r => r.StudentId).OrderBy(id => id).ToArray();
            if (rosterIds.Length == 0 || rosterIds.Length != submittedIds.Distinct().Count() || !rosterIds.SequenceEqual(submittedIds) || request.Records.Any(r => r.Status.Trim().ToLowerInvariant() is not ("present" or "absent" or "leave")))
                return BadRequest(new { success = false, message = "A valid status for every active roster student is required" });

            var college = await _mongo.Colleges.Find(c => c.Id == marker.CollegeId).FirstOrDefaultAsync();
            var date = AttendanceRules.CollegeNow(college?.TimeZone ?? "Asia/Kolkata").ToString("yyyy-MM-dd");
            var records = await _mongo.AttendanceRecords.Find(a => a.CollegeId == marker.CollegeId && a.ClassId == assignment.ClassId && a.Date == date && a.Session == session && a.MarkedBy == marker.Id).ToListAsync();
            if (records.Count != roster.Count) return NotFound(new { success = false, message = "Original CR submission not found" });
            if (records.Max(a => a.CreatedAt) < DateTime.UtcNow.AddMinutes(-15)) return StatusCode(403, new { success = false, message = "The 15-minute correction window has closed" });

            var requested = request.Records.ToDictionary(r => r.StudentId, r => r.Status.Trim().ToLowerInvariant());
            var now = DateTime.UtcNow;
            var writes = new List<WriteModel<AttendanceRecord>>();
            foreach (var record in records.Where(r => requested[r.StudentId] != r.Status))
            {
                var status = requested[record.StudentId];
                record.AuditHistory.Add(new AttendanceAuditEntry { ChangedBy = marker.Id!, PreviousStatus = record.Status, NewStatus = status, Reason = "CR correction within 15 minutes", ChangedAt = now });
                record.Status = status;
                record.UpdatedAt = now;
                writes.Add(new ReplaceOneModel<AttendanceRecord>(Builders<AttendanceRecord>.Filter.Eq(a => a.Id, record.Id), record));
            }
            if (writes.Count > 0) await _mongo.AttendanceRecords.BulkWriteAsync(writes);
            await RecalculateAttendanceAsync(roster);
            return Ok(new { success = true, data = new { date, session, updated = writes.Count } });
        }

        [HttpGet("history")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> History([FromQuery] string? from = null, [FromQuery] string? to = null)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            var filter = Builders<AttendanceRecord>.Filter.Eq(a => a.StudentId, UserId);
            if (!string.IsNullOrWhiteSpace(from)) filter &= Builders<AttendanceRecord>.Filter.Gte(a => a.Date, from);
            if (!string.IsNullOrWhiteSpace(to)) filter &= Builders<AttendanceRecord>.Filter.Lte(a => a.Date, to);
            var records = await _mongo.AttendanceRecords.Find(filter).SortByDescending(a => a.Date).ThenByDescending(a => a.Session).ToListAsync();
            var percentage = records.Count == 0 ? (double?)null : Math.Round(records.Count(a => a.Status == "present") * 100d / records.Count, 2);
            return Ok(new { success = true, data = records, attendancePercentage = percentage });
        }

        [HttpGet("student/{studentId}/history")]
        [Authorize(Roles = "student,mentor,college-admin")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> StudentHistory(string studentId)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (!ObjectId.TryParse(studentId, out _)) return BadRequest(new { success = false, message = "Invalid student ID" });
            var student = await _mongo.Students.Find(s => s.Id == studentId).FirstOrDefaultAsync();
            if (student == null) return NotFound(new { success = false, message = "Student not found" });

            if (Role == "student" && student.Id != UserId) return Forbid();
            if (Role == "mentor")
            {
                var mentor = await _mongo.Mentors.Find(m => m.Id == UserId).FirstOrDefaultAsync();
                if (mentor == null || mentor.CollegeId != student.CollegeId || student.MentorId != mentor.Id) return Forbid();
            }
            if (Role == "college-admin")
            {
                var (_, collegeId) = await AdminScopeAsync();
                if (string.IsNullOrEmpty(collegeId) || collegeId != student.CollegeId) return Forbid();
            }

            var records = await _mongo.AttendanceRecords.Find(a => a.StudentId == student.Id).SortBy(a => a.Date).ThenBy(a => a.Session).ToListAsync();
            var percentage = records.Count == 0 ? (double?)null : Math.Round(records.Count(a => a.Status == "present") * 100d / records.Count, 2);
            return Ok(new { success = true, data = records, attendancePercentage = percentage });
        }

        [HttpGet("admin/summary")]
        [Authorize(Roles = "college-admin")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> Summary([FromQuery] string? classId = null, [FromQuery] string? date = null, [FromQuery] string? session = null)
        {
            var (_, collegeId) = await AdminScopeAsync();
            if (string.IsNullOrEmpty(collegeId)) return Unauthorized();
            var college = await _mongo.Colleges.Find(c => c.Id == collegeId).FirstOrDefaultAsync();
            date ??= AttendanceRules.CollegeNow(college?.TimeZone ?? "Asia/Kolkata").ToString("yyyy-MM-dd");
            session = string.IsNullOrWhiteSpace(session) ? null : session.Trim().ToLowerInvariant();

            var filter = Builders<AttendanceRecord>.Filter.Eq(a => a.CollegeId, collegeId) & Builders<AttendanceRecord>.Filter.Eq(a => a.Date, date);
            if (!string.IsNullOrWhiteSpace(classId)) filter &= Builders<AttendanceRecord>.Filter.Eq(a => a.ClassId, classId);
            if (session != null) filter &= Builders<AttendanceRecord>.Filter.Eq(a => a.Session, session);
            var records = await _mongo.AttendanceRecords.Find(filter).ToListAsync();

            var rosterFilter = StudentRosterRules.Active(collegeId, classId);
            var roster = await _mongo.Students.Find(rosterFilter).ToListAsync();
            var expected = roster.Count * (session == null ? 2 : 1);
            var names = roster.Where(s => s.Id != null).ToDictionary(s => s.Id!, s => new { s.Name, s.RollNo });
            var data = records.Select(a => new
            {
                record = a,
                student = names.GetValueOrDefault(a.StudentId)
            });
            return Ok(new
            {
                success = true,
                filters = new { classId, date, session },
                summary = new { total = expected, present = records.Count(a => a.Status == "present"), absent = records.Count(a => a.Status == "absent"), unmarked = Math.Max(0, expected - records.Count) },
                data
            });
        }

        [HttpGet("admin/roster")]
        [Authorize(Roles = "college-admin")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> Roster([FromQuery] string? classId = null)
        {
            var (_, collegeId) = await AdminScopeAsync();
            if (string.IsNullOrEmpty(collegeId)) return Unauthorized();
            var filter = StudentRosterRules.Active(collegeId, classId);
            var students = await _mongo.Students.Find(filter).SortBy(s => s.Class).ThenBy(s => s.RollNo).ToListAsync();
            return Ok(new { success = true, data = students.Select(s => new { _id = s.Id, s.Name, s.RollNo, classId = s.Class }) });
        }

        [HttpGet("admin/leaders")]
        [Authorize(Roles = "college-admin")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> Leaders([FromQuery] bool activeOnly = false)
        {
            var (_, collegeId) = await AdminScopeAsync();
            if (string.IsNullOrEmpty(collegeId)) return Unauthorized();
            var filter = Builders<LeadershipAssignment>.Filter.Eq(a => a.CollegeId, collegeId);
            if (activeOnly) filter &= Builders<LeadershipAssignment>.Filter.Eq(a => a.IsActive, true);
            var assignments = await _mongo.LeadershipAssignments.Find(filter).SortByDescending(a => a.StartDate).ToListAsync();
            var ids = assignments.Select(a => a.StudentId).Distinct().ToList();
            var students = await _mongo.Students.Find(s => ids.Contains(s.Id!)).ToListAsync();
            var names = students.Where(s => s.Id != null).ToDictionary(s => s.Id!, s => new { s.Name, s.RollNo });
            return Ok(new { success = true, data = assignments.Select(a => new { assignment = a, student = names.GetValueOrDefault(a.StudentId) }) });
        }

        [HttpPost("admin/leaders")]
        [Authorize(Roles = "college-admin")]
        public async Task<IActionResult> AssignLeader([FromBody] AssignLeaderRequest request)
        {
            var (adminId, collegeId) = await AdminScopeAsync();
            if (string.IsNullOrEmpty(adminId) || string.IsNullOrEmpty(collegeId)) return Unauthorized();
            if (request == null) return BadRequest(new { success = false, message = "Assignment details are required" });
            var type = request.LeadershipType.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(request.StudentId) || string.IsNullOrWhiteSpace(request.ClassId) || string.IsNullOrWhiteSpace(type))
                return BadRequest(new { success = false, message = "Student, class and leadership type are required" });
            var studentFilter = StudentRosterRules.Active(collegeId, request.ClassId) & Builders<Student>.Filter.Eq(s => s.Id, request.StudentId);
            var student = await _mongo.Students.Find(studentFilter).FirstOrDefaultAsync();
            if (student == null) return BadRequest(new { success = false, message = "Student is not on the active roster for this class" });
            var duplicate = await _mongo.LeadershipAssignments.Find(a => a.StudentId == student.Id && a.LeadershipType == type && a.IsActive).AnyAsync();
            if (duplicate) return Conflict(new { success = false, message = "This student already has that active leadership assignment" });

            var assignment = new LeadershipAssignment
            {
                StudentId = student.Id!, CollegeId = collegeId, ClassId = request.ClassId.Trim(), LeadershipType = type,
                StartDate = request.StartDate ?? DateTime.UtcNow, EndDate = request.EndDate, IsActive = true, AssignedBy = adminId
            };
            if (assignment.EndDate.HasValue && assignment.EndDate <= assignment.StartDate)
                return BadRequest(new { success = false, message = "End date must be after start date" });
            await _mongo.LeadershipAssignments.InsertOneAsync(assignment);
            return Ok(new { success = true, data = assignment });
        }

        [HttpPost("admin/leaders/{id}/revoke")]
        [Authorize(Roles = "college-admin")]
        public async Task<IActionResult> RevokeLeader(string id)
        {
            var (_, collegeId) = await AdminScopeAsync();
            if (string.IsNullOrEmpty(collegeId)) return Unauthorized();
            var result = await _mongo.LeadershipAssignments.UpdateOneAsync(
                a => a.Id == id && a.CollegeId == collegeId && a.IsActive,
                Builders<LeadershipAssignment>.Update.Set(a => a.IsActive, false).Set(a => a.EndDate, DateTime.UtcNow));
            return result.ModifiedCount == 0 ? NotFound(new { success = false, message = "Active assignment not found" }) : Ok(new { success = true });
        }

        [HttpPatch("admin/records/{id}")]
        [Authorize(Roles = "college-admin")]
        public async Task<IActionResult> Correct(string id, [FromBody] CorrectAttendanceRequest request)
        {
            var (adminId, collegeId) = await AdminScopeAsync();
            if (string.IsNullOrEmpty(adminId) || string.IsNullOrEmpty(collegeId)) return Unauthorized();
            if (request == null) return BadRequest(new { success = false, message = "Correction details are required" });
            var status = request.Status.Trim().ToLowerInvariant();
            if (status is not ("present" or "absent" or "leave") || string.IsNullOrWhiteSpace(request.Reason))
                return BadRequest(new { success = false, message = "A valid status and correction reason are required" });
            var record = await _mongo.AttendanceRecords.Find(a => a.Id == id && a.CollegeId == collegeId).FirstOrDefaultAsync();
            if (record == null) return NotFound(new { success = false, message = "Attendance record not found" });
            if (record.Status == status) return BadRequest(new { success = false, message = "Corrected status must be different" });

            record.AuditHistory.Add(new AttendanceAuditEntry { ChangedBy = adminId, PreviousStatus = record.Status, NewStatus = status, Reason = request.Reason.Trim(), ChangedAt = DateTime.UtcNow });
            record.Status = status;
            record.UpdatedAt = DateTime.UtcNow;
            await _mongo.AttendanceRecords.ReplaceOneAsync(a => a.Id == record.Id, record);
            var student = await _mongo.Students.Find(s => s.Id == record.StudentId).FirstOrDefaultAsync();
            if (student != null) await RecalculateAttendanceAsync(new[] { student });
            return Ok(new { success = true, data = record });
        }
    }

    public class MarkAttendanceRequest
    {
        public string Session { get; set; } = string.Empty;
        public List<AttendanceStatusRequest> Records { get; set; } = new();
    }

    public class AttendanceStatusRequest
    {
        public string StudentId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
    }

    public class AssignLeaderRequest
    {
        public string StudentId { get; set; } = string.Empty;
        public string ClassId { get; set; } = string.Empty;
        public string LeadershipType { get; set; } = "CR";
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
    }

    public class CorrectAttendanceRequest
    {
        public string Status { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
    }
}
