using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/students")]
    public class StudentController : ControllerBase
    {
        private readonly MongoService _mongoService;
        private readonly ExcelParserService _excelParserService;
        private readonly EmailQueueService _emailQueueService;
        private readonly NotificationService _notificationService;
        private readonly INvidiaNimService _nvidiaNimService;
        private readonly ICacheService _cacheService;
        private readonly BadgeAwardWorker _badgeAwardWorker;
        private readonly IPushAudienceNotifier _pushAudience;
        private readonly IPushNotificationQueue _pushQueue;

        public StudentController(
            MongoService mongoService,
            ExcelParserService excelParserService,
            EmailQueueService emailQueueService,
            NotificationService notificationService,
            INvidiaNimService nvidiaNimService,
            ICacheService cacheService,
            BadgeAwardWorker badgeAwardWorker,
            IPushAudienceNotifier pushAudience,
            IPushNotificationQueue pushQueue)
        {
            _mongoService = mongoService;
            _excelParserService = excelParserService;
            _emailQueueService = emailQueueService;
            _notificationService = notificationService;
            _nvidiaNimService = nvidiaNimService;
            _cacheService = cacheService;
            _badgeAwardWorker = badgeAwardWorker;
            _pushAudience = pushAudience;
            _pushQueue = pushQueue;
        }

        // --- STUDENT ALERTS: Announcements + Events for their college ---
        [HttpGet("my-alerts")]
        public async Task<IActionResult> GetMyAlerts()
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { success = false, message = "Not authenticated" });

            // Resolve the student to get their collegeId
            var student = await _mongoService.Students.Find(s => s.Id == userId).FirstOrDefaultAsync();
            if (student == null)
                return NotFound(new { success = false, message = "Student not found" });

            var collegeId = student.CollegeId;
            var results = new List<object>();
            var cutoff = DateTime.UtcNow.AddDays(-15);

            // Fetch announcements for this college (not expired)
            if (!string.IsNullOrEmpty(collegeId))
            {
                var announcements = await _mongoService.Announcements
                    .Find(a => a.CollegeId == collegeId && a.CreatedAt >= cutoff)
                    .SortByDescending(a => a.CreatedAt)
                    .Limit(50)
                    .ToListAsync();

                foreach (var a in announcements)
                {
                    // Skip expired announcements
                    if (a.ExpiryDate.HasValue && a.ExpiryDate.Value < DateTime.UtcNow) continue;

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

                // Fetch events for this college
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

            // Sort combined results by createdAt descending
            results = results.OrderByDescending(r => ((dynamic)r).createdAt).Take(10).ToList();

            return Ok(new { success = true, data = results });
        }

        [HttpGet]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetStudents(
            [FromQuery] int page = 1,
            [FromQuery] int limit = 8,
            [FromQuery] string? course = null,
            [FromQuery] string? @class = null,
            [FromQuery] string? search = null,
            [FromQuery] string? riskLevel = null,
            [FromQuery] string? collegeId = null,
            [FromQuery] string? courseId = null,
            [FromQuery] string? classId = null)
        {
            page = Math.Max(1, page);
            limit = Math.Clamp(limit, 1, 100);
            @class = string.IsNullOrWhiteSpace(@class) ? classId : @class;

            var filters = new List<FilterDefinition<Student>>();

            // Role-based visibility check: Mentors can only see their assigned students
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var userId = User.FindFirst("id")?.Value;
            if (userRole == "mentor" && !string.IsNullOrEmpty(userId))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.MentorId, userId));
            }
            if (userRole == "college-admin" && !string.IsNullOrEmpty(userId))
            {
                var admin = await _mongoService.Admins.Find(a => a.Id == userId).FirstOrDefaultAsync();
                if (string.IsNullOrEmpty(admin?.CollegeId))
                    return Forbid();

                filters.Add(Builders<Student>.Filter.Eq(s => s.CollegeId, admin.CollegeId));
                collegeId = null;
            }

            if (!string.IsNullOrWhiteSpace(course))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.Course, course));
            }
            if (!string.IsNullOrWhiteSpace(@class))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.Class, @class));
            }
            if (!string.IsNullOrWhiteSpace(riskLevel))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.RiskLevel, riskLevel.ToLower()));
            }
            if (!string.IsNullOrWhiteSpace(collegeId))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.CollegeId, collegeId));
            }
            if (!string.IsNullOrWhiteSpace(courseId))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.CourseId, courseId));
            }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var regex = new MongoDB.Bson.BsonRegularExpression(search.Trim(), "i");
                filters.Add(Builders<Student>.Filter.Or(
                    Builders<Student>.Filter.Regex(s => s.Name, regex),
                    Builders<Student>.Filter.Regex(s => s.RollNo, regex),
                    Builders<Student>.Filter.Regex(s => s.Email, regex)
                ));
            }

            var filter = filters.Count > 0
                ? Builders<Student>.Filter.And(filters)
                : Builders<Student>.Filter.Empty;

            async Task<StudentPage> LoadPageAsync() => new()
            {
                Total = await _mongoService.Students.CountDocumentsAsync(filter),
                Data = (await _mongoService.Students.Find(filter).SortByDescending(s => s.RiskScore).ThenBy(s => s.Name).Skip((page - 1) * limit).Limit(limit).ToListAsync())
                    .Select(s => new StudentListItem
                    {
                        Id = s.Id, RollNo = s.RollNo, Name = s.Name, Email = s.Email, Course = s.Course, Class = s.Class,
                        Attendance = s.Attendance, RiskScore = s.RiskScore, RiskLevel = s.RiskLevel, Behavior = s.Behavior,
                        VerificationStatus = s.VerificationStatus, Marks = s.Marks
                    }).ToList()
            };
            var cacheSignature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{page}|{limit}|{course}|{@class}|{search}|{riskLevel}|{collegeId}|{courseId}")));
            var result = userRole == "mentor" && !string.IsNullOrEmpty(userId)
                ? await _cacheService.GetOrCreateAsync(
                    $"mentor-students:{userId}:{cacheSignature}",
                    TimeSpan.FromMinutes(5), LoadPageAsync)
                : await LoadPageAsync();

            return Ok(new
            {
                success = true,
                count = result.Data.Count,
                total = result.Total,
                pages = (int)Math.Ceiling(result.Total / (double)limit),
                data = result.Data
            });
        }

        private sealed class StudentPage
        {
            public long Total { get; set; }
            public List<StudentListItem> Data { get; set; } = new();
        }

        private sealed class StudentListItem
        {
            [System.Text.Json.Serialization.JsonPropertyName("_id")]
            public string? Id { get; set; }
            public string RollNo { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Course { get; set; } = string.Empty;
            public string Class { get; set; } = string.Empty;
            public double? Attendance { get; set; }
            public double RiskScore { get; set; }
            public string RiskLevel { get; set; } = string.Empty;
            public string? Behavior { get; set; }
            public string VerificationStatus { get; set; } = string.Empty;
            public List<SubjectMarks> Marks { get; set; } = new();
        }

        [HttpGet("stats")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetDashboardStats([FromQuery] string? course = null, [FromQuery] string? @class = null)
        {
            var filters = new List<FilterDefinition<Student>>();
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var userId = User.FindFirst("id")?.Value;

            if (userRole == "mentor" && !string.IsNullOrEmpty(userId))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.MentorId, userId));
            }

            if (!string.IsNullOrWhiteSpace(course))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.Course, course));
            }
            if (!string.IsNullOrWhiteSpace(@class))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.Class, @class));
            }

            var filter = filters.Count > 0
                ? Builders<Student>.Filter.And(filters)
                : Builders<Student>.Filter.Empty;

            var students = await _mongoService.Students.Find(filter).ToListAsync();

            var notifFilters = new List<FilterDefinition<Notification>>();
            if (userRole == "mentor" && !string.IsNullOrEmpty(userId))
            {
                notifFilters.Add(Builders<Notification>.Filter.Eq(n => n.MentorId, userId));
            }
            var notifFilter = notifFilters.Count > 0
                ? Builders<Notification>.Filter.And(notifFilters)
                : Builders<Notification>.Filter.Empty;

            var notifications = await _mongoService.Notifications
                .Find(notifFilter)
                .SortByDescending(n => n.CreatedAt)
                .Limit(5)
                .ToListAsync();

            var riskDistribution = new
            {
                low = students.Count(s => string.Equals(s.RiskLevel, "low", StringComparison.OrdinalIgnoreCase)),
                medium = students.Count(s => string.Equals(s.RiskLevel, "medium", StringComparison.OrdinalIgnoreCase)),
                high = students.Count(s => string.Equals(s.RiskLevel, "high", StringComparison.OrdinalIgnoreCase)),
                critical = students.Count(s => string.Equals(s.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase))
            };

            var today = DateTime.UtcNow.Date;

            return Ok(new
            {
                success = true,
                data = new
                {
                    totalStudents = students.Count,
                    atRiskStudents = students.Count(s =>
                        string.Equals(s.RiskLevel, "high", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(s.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase)),
                    avgAttendance = students.Where(s => s.Attendance.HasValue).Select(s => s.Attendance!.Value).DefaultIfEmpty(0).Average(),
                    criticalAlertsCount = notifications.Count(n =>
                        string.Equals(n.Priority, "urgent", StringComparison.OrdinalIgnoreCase) &&
                        n.CreatedAt >= today),
                    riskDistribution,
                    recentNotifications = notifications
                }
            });
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadStudents([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { success = false, message = "Please upload an Excel file" });
            }

            var userId = User.FindFirst("id")?.Value;
            var currentMentor = await _mongoService.Mentors.Find(m => m.Id == userId).FirstOrDefaultAsync();

            int createdCount = 0;
            int updatedCount = 0;
            int skippedCount = 0;

            try
            {
                List<ParsedStudentRow> parsedRows;
                using (var stream = file.OpenReadStream())
                {
                    parsedRows = _excelParserService.ParseRoster(stream);
                }

                foreach (var row in parsedRows)
                {
                    if (string.IsNullOrEmpty(row.RollNo))
                    {
                        skippedCount++;
                        continue;
                    }

                    // Find existing student by RollNo and CollegeId
                    var mentorCollegeId = currentMentor?.CollegeId;
                    var student = await _mongoService.Students.Find(s => s.CollegeId == mentorCollegeId && s.RollNo == row.RollNo).FirstOrDefaultAsync();
                    Student? oldValues = null;
                    bool isNew = student == null;

                    string verificationToken = Guid.NewGuid().ToString("N");


                    if (isNew)
                    {
                        var collegeName = "";
                        if (currentMentor != null && !string.IsNullOrEmpty(currentMentor.CollegeId))
                        {
                            var college = await _mongoService.Colleges.Find(c => c.Id == currentMentor.CollegeId).FirstOrDefaultAsync();
                            if (college != null) collegeName = college.Name;
                        }

                        student = new Student
                        {
                            RollNo = row.RollNo,
                            Name = row.Name,
                            Email = row.Email,
                            PhoneNo = row.PhoneNo,
                            IsVerified = true, // pre-added student is pre-verified
                            IsRegistered = false, // waiting for signup
                            VerificationStatus = "approved", // pre-added is pre-approved
                            VerificationToken = verificationToken,
                            CollegeId = currentMentor?.CollegeId,
                            CollegeName = collegeName,
                            CourseId = currentMentor?.AssignedCourseId,
                            Course = currentMentor?.Department ?? "BCA", 
                            Class = currentMentor?.AssignedClasses?.FirstOrDefault() ?? "BCA-A",
                            MentorId = currentMentor?.Id,
                            MentorName = currentMentor?.Name,
                            Semester = 1,
                            Marks = new(),
                            Contribution = new(),
                            CreatedAt = DateTime.UtcNow
                        };
                    }
                    else
                    {
                        student!.Marks ??= new();
                        foreach (var mark in student.Marks)
                        {
                            mark.ClassTests ??= new();
                            mark.MidTerm ??= new ExamMarks { MaxMarks = 100 };
                            mark.HouseExam ??= new ExamMarks { MaxMarks = 100 };
                        }

                        // Clone old values for notifications check
                        oldValues = new Student
                        {
                            Attendance = student.Attendance,
                            Behavior = student.Behavior,
                            RiskLevel = student.RiskLevel,
                            Marks = student.Marks?.Select(m => new SubjectMarks
                            {
                                SubjectName = m.SubjectName,
                                ClassTests = m.ClassTests?.Select(t => new ClassTest { TestNumber = t.TestNumber, Marks = t.Marks, MaxMarks = t.MaxMarks }).ToList() ?? new(),
                                MidTerm = new ExamMarks { Marks = m.MidTerm?.Marks, MaxMarks = m.MidTerm?.MaxMarks ?? 100 },
                                HouseExam = new ExamMarks { Marks = m.HouseExam?.Marks, MaxMarks = m.HouseExam?.MaxMarks ?? 100 }
                            }).ToList() ?? new()
                        };

                        // Update basic info if present
                        if (!string.IsNullOrEmpty(row.Name)) student.Name = row.Name;
                        if (!string.IsNullOrEmpty(row.Email)) student.Email = row.Email;
                        if (!string.IsNullOrEmpty(row.PhoneNo)) student.PhoneNo = row.PhoneNo;
                    }

                    // Map attendance
                    if (row.Attendance.HasValue)
                    {
                        student.Attendance = row.Attendance.Value;
                    }

                    // Map behavior
                    if (!string.IsNullOrEmpty(row.Behavior))
                    {
                        student.Behavior = row.Behavior.ToLower();
                    }

                    // Merge contributions
                    if (row.Contribution != null && row.Contribution.Count > 0)
                    {
                        student.Contribution ??= new();
                        foreach (var c in row.Contribution)
                        {
                            if (!student.Contribution.Contains(c))
                            {
                                student.Contribution.Add(c);
                            }
                        }
                    }

                    // Merge marks dynamic data
                    if (row.Marks != null)
                    {
                        student.Marks ??= new();
                        foreach (var parsedSub in row.Marks)
                        {
                            var studentSub = student.Marks.FirstOrDefault(
                                m => string.Equals(m.SubjectName, parsedSub.SubjectName, StringComparison.OrdinalIgnoreCase)
                            );

                            if (studentSub == null)
                            {
                                studentSub = new SubjectMarks
                                {
                                    SubjectName = parsedSub.SubjectName,
                                    IsPractical = parsedSub.IsPractical,
                                    ClassTests = new(),
                                    MidTerm = new ExamMarks { Marks = null, MaxMarks = 100 },
                                    HouseExam = new ExamMarks { Marks = null, MaxMarks = 100 }
                                };
                                student.Marks.Add(studentSub);
                            }

                            // Merge class tests
                            if (parsedSub.ClassTests != null)
                            {
                                foreach (var parsedTest in parsedSub.ClassTests)
                                {
                                    var existingTest = studentSub.ClassTests.FirstOrDefault(t => t.TestNumber == parsedTest.TestNumber);
                                    if (existingTest == null)
                                    {
                                        studentSub.ClassTests.Add(parsedTest);
                                    }
                                    else
                                    {
                                        existingTest.Marks = parsedTest.Marks;
                                        if (parsedTest.MaxMarks > 0)
                                        {
                                            existingTest.MaxMarks = parsedTest.MaxMarks;
                                        }
                                    }
                                }
                            }

                            // Merge midterm
                            if (parsedSub.MidTerm != null)
                            {
                                if (parsedSub.MidTerm.Marks.HasValue)
                                {
                                    studentSub.MidTerm.Marks = parsedSub.MidTerm.Marks;
                                }
                                if (parsedSub.MidTerm.MaxMarks > 0)
                                {
                                    studentSub.MidTerm.MaxMarks = parsedSub.MidTerm.MaxMarks;
                                }
                            }

                            // Merge house exam
                            if (parsedSub.HouseExam != null)
                            {
                                if (parsedSub.HouseExam.Marks.HasValue)
                                {
                                    studentSub.HouseExam.Marks = parsedSub.HouseExam.Marks;
                                }
                                if (parsedSub.HouseExam.MaxMarks > 0)
                                {
                                    studentSub.HouseExam.MaxMarks = parsedSub.HouseExam.MaxMarks;
                                }
                            }
                        }
                    }

                    // Link Mentor
                    if (string.IsNullOrEmpty(student.MentorId))
                    {
                        var assignedMentor = await _mongoService.Mentors.Find(m => m.AssignedClasses.Contains(student.Class)).FirstOrDefaultAsync();
                        if (assignedMentor != null)
                        {
                            student.MentorId = assignedMentor.Id;
                        }
                        else if (currentMentor != null)
                        {
                            student.MentorId = currentMentor.Id;
                        }
                    }

                    // Recalculate Risk
                    var riskResult = RiskEngine.CalculateRisk(student);
                    student.RiskScore = riskResult.RiskScore;
                    student.RiskLevel = riskResult.RiskLevel;

                    // Reset AI caches
                    student.RiskExplanation = string.Empty;
                    student.AiImprovementPlan = string.Empty;
                    student.UpdatedAt = DateTime.UtcNow;

                    // Save student
                    if (isNew)
                    {
                        await _mongoService.Students.InsertOneAsync(student);
                        createdCount++;

                        // Queue verification email for new students
                        if (!string.IsNullOrEmpty(student.Email))
                        {
                            _emailQueueService.QueueEmail(student.Email, verificationToken);
                        }
                    }
                    else
                    {
                        await _mongoService.Students.ReplaceOneAsync(s => s.Id == student.Id, student);
                        updatedCount++;
                    }

                    // Check notifications
                    await _notificationService.CheckAndGenerateNotificationsAsync(student, oldValues);
                }

                return Ok(new
                {
                    success = true,
                    data = new { created = createdCount, updated = updatedCount, skipped = skippedCount }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Failed to parse Excel: {ex.Message}" });
            }
        }

        [HttpGet("class/{className}")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetStudentsByClass(string className)
        {
            var students = await _mongoService.Students.Find(s => s.Class == className).ToListAsync();
            return Ok(new { success = true, data = students });
        }

        [HttpGet("class/{className}/summary")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> GetClassSummary(string className)
        {
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var userId = User.FindFirst("id")?.Value;
            var cacheUserId = userRole == "mentor" ? userId : "all";
            var cacheKey = $"{userRole ?? "unknown"}:{cacheUserId}:{className}".ToLowerInvariant();
            var now = DateTime.UtcNow;

            var filters = new List<FilterDefinition<Student>>
            {
                Builders<Student>.Filter.Eq(s => s.Class, className)
            };

            if (userRole == "mentor" && !string.IsNullOrEmpty(userId))
            {
                filters.Add(Builders<Student>.Filter.Eq(s => s.MentorId, userId));
            }

            var filter = Builders<Student>.Filter.And(filters);
            var students = await _mongoService.Students.Find(filter).ToListAsync();
            if (students.Count == 0)
            {
                return NotFound(new { success = false, message = "No students found in this class" });
            }

            int totalStudents = students.Count;
            double avgAttendance = students.Where(s => s.Attendance.HasValue).Select(s => s.Attendance!.Value).DefaultIfEmpty(0).Average();
            
            // Calculate overall marks percentage average
            var allSubjectAverages = new List<double>();
            var failingCountBySubject = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            foreach (var student in students)
            {
                if (student.Marks == null) continue;
                foreach (var mark in student.Marks)
                {
                    var avg = RiskEngine.CalculateSubjectAverage(mark);
                    if (avg.HasValue)
                    {
                        allSubjectAverages.Add(avg.Value);
                        if (avg.Value < 35)
                        {
                            failingCountBySubject[mark.SubjectName] = failingCountBySubject.GetValueOrDefault(mark.SubjectName, 0) + 1;
                        }
                    }
                }
            }

            double avgMarks = allSubjectAverages.Count > 0 ? allSubjectAverages.Average() : 0;
            int atRiskCount = students.Count(s => string.Equals(s.RiskLevel, "high", StringComparison.OrdinalIgnoreCase) || 
                                                  string.Equals(s.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase));

            // Select failing subjects (where at least one student failed)
            var failingSubjects = failingCountBySubject
                .OrderByDescending(x => x.Value)
                .Select(x => x.Key)
                .Take(3)
                .ToList();

            var subjectAverages = students
                .Where(s => s.Marks != null)
                .SelectMany(s => s.Marks)
                .GroupBy(m => m.SubjectName, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(RiskEngine.CalculateSubjectAverage)
                          .Where(avg => avg.HasValue)
                          .Select(avg => avg!.Value)
                          .DefaultIfEmpty(0)
                          .Average(),
                    StringComparer.OrdinalIgnoreCase);

            var stats = new ClassStats
            {
                ClassName = className,
                TotalStudents = totalStudents,
                AvgAttendance = avgAttendance,
                AvgMarks = avgMarks,
                AtRiskCount = atRiskCount,
                FailingSubjects = failingSubjects
            };

            var cachedSummary = await _mongoService.ClassSummaryCaches
                .Find(c => c.CacheKey == cacheKey && c.ExpiresAt > now)
                .FirstOrDefaultAsync();

            if (cachedSummary != null && !string.IsNullOrWhiteSpace(cachedSummary.Summary))
            {
                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        stats = cachedSummary.Stats,
                        subjectAverages = cachedSummary.SubjectAverages,
                        summary = cachedSummary.Summary,
                        aiSummary = cachedSummary.Summary,
                        generatedAt = cachedSummary.GeneratedAt,
                        expiresAt = cachedSummary.ExpiresAt,
                        cached = true
                    }
                });
            }

            var aiSummary = await _nvidiaNimService.GenerateClassSummaryAsync(stats);
            var generatedAt = DateTime.UtcNow;
            var expiresAt = generatedAt.AddHours(4);

            var statsCache = new ClassSummaryStats
            {
                TotalStudents = totalStudents,
                AvgAttendance = avgAttendance,
                AvgMarks = avgMarks,
                AtRiskCount = atRiskCount,
                FailingSubjects = failingSubjects
            };

            var cacheEntry = new ClassSummaryCache
            {
                CacheKey = cacheKey,
                ClassName = className,
                UserRole = userRole,
                UserId = cacheUserId,
                Stats = statsCache,
                SubjectAverages = subjectAverages,
                Summary = aiSummary,
                GeneratedAt = generatedAt,
                ExpiresAt = expiresAt
            };

            await _mongoService.ClassSummaryCaches.ReplaceOneAsync(
                c => c.CacheKey == cacheKey,
                cacheEntry,
                new ReplaceOptions { IsUpsert = true });

            return Ok(new
            {
                success = true,
                data = new
                {
                    stats = new
                    {
                        totalStudents,
                        avgAttendance,
                        avgMarks,
                        atRiskCount,
                        failingSubjects
                    },
                    subjectAverages,
                    summary = aiSummary,
                    aiSummary,
                    generatedAt,
                    expiresAt,
                    cached = false
                }
            });
        }

        private async Task<object> MapToProfileDto(Student student)
        {
            object? mentorInfo = null;
            var now = DateTime.UtcNow;
            var isCr = await _mongoService.LeadershipAssignments.Find(a =>
                a.StudentId == student.Id && a.IsActive && a.LeadershipType == "CR" &&
                a.StartDate <= now && (!a.EndDate.HasValue || a.EndDate > now)).AnyAsync();
            if (!string.IsNullOrEmpty(student.MentorId))
            {
                var mentor = await _mongoService.Mentors.Find(m => m.Id == student.MentorId).FirstOrDefaultAsync();
                if (mentor != null)
                {
                    mentorInfo = new
                    {
                        _id = mentor.Id,
                        name = mentor.Name,
                        email = mentor.Email,
                        status = mentor.Status,
                        isOnline = mentor.IsOnline
                    };
                }
            }

            if (mentorInfo == null)
            {
                // Fallback to EduGuard AI Assistant details
                mentorInfo = new
                {
                    _id = "ai-assistant",
                    name = "EduGuard AI Assistant",
                    email = "ai@eduguard.com",
                    status = "approved",
                    isOnline = true
                };
            }

            return new
            {
                _id = student.Id,
                student.CollegeId,
                student.CourseId,
                student.VerificationStatus,
                student.RollNo,
                student.Name,
                isCr,
                student.Email,
                student.PhoneNo,
                student.IsVerified,
                student.Course,
                student.Class,
                mentorId = mentorInfo,
                student.Semester,
                student.Attendance,
                student.Marks,
                student.Behavior,
                student.Contribution,
                student.RiskScore,
                student.RiskLevel,
                student.RiskExplanation,
                student.AiImprovementPlan,
                student.Notifications,
                student.CreatedAt,
                student.UpdatedAt
            };
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetStudent(string id)
        {
            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }
            var dto = await MapToProfileDto(student);
            return Ok(new { success = true, data = dto });
        }

        [HttpPut("{id}")]
        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateStudent(string id, [FromBody] StudentUpdatePayload model)
        {
            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }

            var oldValues = new Student
            {
                Attendance = student.Attendance,
                Behavior = student.Behavior,
                RiskLevel = student.RiskLevel,
                Marks = student.Marks // simplifed clone
            };

            student.Name = model.Name ?? student.Name;
            student.Email = model.Email ?? student.Email;
            student.PhoneNo = model.PhoneNo ?? student.PhoneNo;
            student.Attendance = model.Attendance ?? student.Attendance;
            student.Behavior = model.Behavior ?? student.Behavior;

            if (model.Contribution != null)
            {
                student.Contribution = model.Contribution;
            }
            if (model.Marks != null)
            {
                student.Marks = model.Marks;
            }

            // Recalculate Risk
            var riskResult = RiskEngine.CalculateRisk(student);
            student.RiskScore = riskResult.RiskScore;
            student.RiskLevel = riskResult.RiskLevel;

            // Reset AI cache only if metrics changed, or apply explicit updates
            if (model.AiImprovementPlan != null)
            {
                student.AiImprovementPlan = model.AiImprovementPlan;
            }
            else if (model.Attendance != null || model.Behavior != null || model.Marks != null)
            {
                student.AiImprovementPlan = string.Empty;
            }

            if (model.RiskExplanation != null)
            {
                student.RiskExplanation = model.RiskExplanation;
            }
            else if (model.Attendance != null || model.Behavior != null || model.Marks != null)
            {
                student.RiskExplanation = string.Empty;
            }

            student.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Students.ReplaceOneAsync(s => s.Id == id, student);
 
            // Trigger notification check
            await _notificationService.CheckAndGenerateNotificationsAsync(student, oldValues);

            var dto = await MapToProfileDto(student);
            return Ok(new { success = true, data = dto });
        }

        [HttpPost("{id}/select-mentor")]
        [HttpPatch("select-mentor")]
        public async Task<IActionResult> SelectMentor(string? id, [FromBody] SelectMentorPayload model)
        {
            if (model == null || string.IsNullOrEmpty(model.MentorId))
            {
                return BadRequest(new { success = false, message = "Please provide mentorId" });
            }

            var studentId = id ?? User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(studentId))
            {
                return Unauthorized(new { success = false, message = "User ID not found in claims" });
            }

            var student = await _mongoService.Students.Find(s => s.Id == studentId).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }

            // Verify mentor exists
            var mentor = await _mongoService.Mentors.Find(m => m.Id == model.MentorId).FirstOrDefaultAsync();
            if (mentor == null)
            {
                return NotFound(new { success = false, message = "Mentor not found" });
            }

            // Verify mentor capacity is not exceeded (max 30 students)
            var currentCount = await _mongoService.Students.CountDocumentsAsync(s => s.MentorId == model.MentorId);
            if (currentCount >= 30)
            {
                return BadRequest(new { success = false, message = "Mentor has reached their maximum capacity of 30 students" });
            }

            student.MentorId = model.MentorId;
            student.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Students.ReplaceOneAsync(s => s.Id == studentId, student);

            // Send notification to student and mentor
            await _notificationService.CreateNotificationAsync(
                model.MentorId,
                studentId,
                "mentor_assigned",
                $"Mentor {mentor.Name} has been assigned to student {student.Name}.",
                "medium"
            );

            var dto = await MapToProfileDto(student);
            return Ok(new { success = true, message = "Mentor successfully assigned", data = dto });
        }

        [HttpGet("{id}/explanation")]
        public async Task<IActionResult> GetRiskExplanation(string id)
        {
            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }

            if (!string.IsNullOrEmpty(student.RiskExplanation))
            {
                return Ok(new { success = true, data = student.RiskExplanation, explanation = student.RiskExplanation });
            }

            var explanation = await _nvidiaNimService.GenerateRiskExplanationAsync(student);

            // Cache in DB
            student.RiskExplanation = explanation;
            await _mongoService.Students.ReplaceOneAsync(s => s.Id == id, student);

            return Ok(new { success = true, data = explanation, explanation });
        }

        [HttpGet("{id}/recovery-plan")]
        [HttpGet("{id}/improvement")]
        public async Task<IActionResult> GetRecoveryPlan(string id)
        {
            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }

            if (!string.IsNullOrEmpty(student.AiImprovementPlan))
            {
                return Ok(new { success = true, data = student.AiImprovementPlan, recoveryPlan = student.AiImprovementPlan });
            }

            var plan = await _nvidiaNimService.GenerateImprovementPlanAsync(student);

            // Cache in DB
            student.AiImprovementPlan = plan;
            await _mongoService.Students.ReplaceOneAsync(s => s.Id == id, student);

            return Ok(new { success = true, data = plan, recoveryPlan = plan });
        }

        [HttpPost("study-planner/{id}")]
        public async Task<IActionResult> GenerateStudyPlan(string id, [FromBody] StudyPlannerRequest request)
        {
            if (request == null) return BadRequest("Request body is required");

            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null) return NotFound("Student not found");

            try
            {
                var plan = await _nvidiaNimService.GeneratePersonalizedStudyPlanAsync(
                    student, 
                    request.WeakSubjects, 
                    request.LearningSpeed, 
                    request.UpcomingExams
                );
                return Ok(new { success = true, plan });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Failed to generate AI study plan: {ex.Message}");
            }
        }

        [HttpPost("assignments")]
        public async Task<IActionResult> CreateAssignment([FromBody] Assignment model)
        {
            if (model == null || string.IsNullOrEmpty(model.Title) || string.IsNullOrEmpty(model.MentorId))
            {
                return BadRequest("Title and MentorId are required");
            }

            var mentor = await _mongoService.Mentors.Find(m => m.Id == model.MentorId).FirstOrDefaultAsync();
            if (mentor != null)
            {
                if (string.IsNullOrEmpty(model.CollegeId)) model.CollegeId = mentor.CollegeId ?? string.Empty;
                if (string.IsNullOrEmpty(model.CourseId)) model.CourseId = mentor.AssignedCourseId ?? string.Empty;
            }

            model.CreatedAt = DateTime.UtcNow;
            model.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Assignments.InsertOneAsync(model);
            await _pushAudience.NotifyStudentsAsync(model.CollegeId, model.Class, $"assignment:{model.Id}",
                new PushMessage("New assignment", model.Title, "normal",
                    new Dictionary<string, string> { ["type"] = "assignment", ["path"] = "/assignments", ["assignmentId"] = model.Id! }));
            return Ok(new { success = true, data = model });
        }

        [HttpGet("assignments")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> ListAssignments([FromQuery] string? courseId = null, [FromQuery] string? @class = null, [FromQuery] string? classId = null)
        {
            var selectedClass = string.IsNullOrWhiteSpace(@class) ? classId : @class;
            var filter = Builders<Assignment>.Filter.Empty;
            if (!string.IsNullOrWhiteSpace(courseId)) filter &= Builders<Assignment>.Filter.Eq(a => a.CourseId, courseId);
            if (!string.IsNullOrWhiteSpace(selectedClass)) filter &= Builders<Assignment>.Filter.Eq(a => a.Class, selectedClass);
            var list = await _mongoService.Assignments.Find(filter).ToListAsync();
            return Ok(new { success = true, data = list });
        }

        [HttpPost("assignments/{assignmentId}/submit")]
        public async Task<IActionResult> SubmitAssignment(string assignmentId, [FromBody] Submission model)
        {
            if (model == null || string.IsNullOrEmpty(model.StudentId) || string.IsNullOrEmpty(model.SubmittedPdfUrl))
            {
                return BadRequest("StudentId and SubmittedPdfUrl are required");
            }
            model.AssignmentId = assignmentId;
            model.SubmittedAt = DateTime.UtcNow;
            await _mongoService.Submissions.InsertOneAsync(model);
            return Ok(new { success = true, data = model });
        }

        [HttpGet("assignments/{assignmentId}/submissions")]
        [EnableRateLimiting("dashboard-fetch")]
        public async Task<IActionResult> ListSubmissions(string assignmentId)
        {
            var list = await _mongoService.Submissions.Find(s => s.AssignmentId == assignmentId).ToListAsync();
            return Ok(new { success = true, data = list });
        }

        [HttpPost("submissions/{submissionId}/grade")]
        public async Task<IActionResult> GradeSubmission(string submissionId, [FromBody] GradeRequest request)
        {
            if (request == null) return BadRequest("Grade and feedback are required");
            var submission = await _mongoService.Submissions.Find(s => s.Id == submissionId).FirstOrDefaultAsync();
            if (submission == null) return NotFound("Submission not found");
            
            var filter = Builders<Submission>.Filter.Eq(s => s.Id, submissionId);
            var update = Builders<Submission>.Update
                .Set(s => s.Grade, request.Grade)
                .Set(s => s.Feedback, request.Feedback)
                .Set(s => s.UpdatedAt, DateTime.UtcNow);

            var result = await _mongoService.Submissions.UpdateOneAsync(filter, update);
            if (result.MatchedCount == 0) return NotFound("Submission not found");

            await _pushQueue.EnqueueAsync(submission.StudentId, $"assignment-graded:{submissionId}:{request.Grade}",
                new PushMessage("Assignment graded", $"Your submission was graded {request.Grade}.", "normal",
                    new Dictionary<string, string> { ["type"] = "assignment_graded", ["path"] = "/assignments", ["assignmentId"] = submission.AssignmentId }));

            return Ok(new { success = true, message = "Submission graded successfully" });
        }

        [HttpPost("{id}/verify")]
        public async Task<IActionResult> VerifyStudentEnrollment(string id, [FromBody] ApproveStudentRequest request)
        {
            if (request == null) return BadRequest("Status is required");
            var status = request.Approve ? "approved" : "rejected";

            var filter = Builders<Student>.Filter.Eq(s => s.Id, id);
            var update = Builders<Student>.Update
                .Set(s => s.VerificationStatus, status)
                .Set(s => s.UpdatedAt, DateTime.UtcNow);

            var result = await _mongoService.Students.UpdateOneAsync(filter, update);
            if (result.MatchedCount == 0) return NotFound("Student not found");

            return Ok(new { success = true, message = $"Student enrollment verification status set to {status}" });
        }

        // --- REPORT CARD BACKGROUND JOBS ---

        [HttpGet("me/badges")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> MyBadges()
        {
            var studentId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(studentId)) return Unauthorized();
            var student = await _mongoService.Students.Find(s => s.Id == studentId).FirstOrDefaultAsync();
            if (student == null) return NotFound(new { success = false, message = "Student not found" });
            var badges = student.EarnedBadges ?? new List<StudentBadge>();
            var existing = badges.Select(b => b.SourceKey).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var hasNewContribution = student.Contribution.Where(c => !string.IsNullOrWhiteSpace(c)).Any(c => !existing.Contains(BadgeAwardWorker.Normalize(c)));
            var due = !student.LastBadgeCheckAt.HasValue || student.LastBadgeCheckAt <= DateTime.UtcNow.AddDays(-3);
            var processing = (hasNewContribution || due) && _badgeAwardWorker.EnsureQueued(student.Id!);
            return Ok(new { success = true, data = badges, processing, lastCheckedAt = student.LastBadgeCheckAt });
        }

        [HttpGet("{id}/badges")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> StudentBadges(string id)
        {
            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null) return NotFound(new { success = false, message = "Student not found" });
            if (!await CanAccessBadgesAsync(student, false)) return Forbid();
            return Ok(new { success = true, data = student.EarnedBadges ?? new List<StudentBadge>() });
        }

        [HttpPost("{id}/badges")]
        [Authorize(Roles = "mentor,admin,college-admin")]
        public async Task<IActionResult> AwardBadge(string id, [FromForm] AwardBadgeRequest request)
        {
            var student = await _mongoService.Students.Find(s => s.Id == id).FirstOrDefaultAsync();
            if (student == null) return NotFound(new { success = false, message = "Student not found" });
            if (!await CanAccessBadgesAsync(student, true)) return Forbid();

            var allowedBadges = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "class-representative", "participation", "competition-winner", "runner-up", "nss-volunteer",
                "community-service", "sports-achievement", "cultural-performer", "debate-champion", "coding-champion",
                "academic-excellence", "event-coordinator", "attendance-excellence", "team-leader", "innovation-award"
            };
            var allowedCategories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "leadership", "academic", "sports", "cultural", "service", "technical", "participation" };
            var allowedLevels = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "college", "university", "state", "national" };
            var badgeId = request.BadgeId?.Trim() ?? "";
            var category = request.Category?.Trim().ToLowerInvariant() ?? "";
            var level = request.Level?.Trim().ToLowerInvariant();
            if (!allowedBadges.Contains(badgeId) || string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 120 ||
                string.IsNullOrWhiteSpace(request.Description) || request.Description.Length > 500 || !allowedCategories.Contains(category) ||
                string.IsNullOrWhiteSpace(request.EventName) || request.EventName.Length > 120 || string.IsNullOrWhiteSpace(request.AwardedBy) || request.AwardedBy.Length > 120 ||
                !request.AwardedAt.HasValue)
                return BadRequest(new { success = false, message = "Badge, title, description, event, awarded date, awarded by and a valid category are required" });
            if (string.IsNullOrEmpty(level) || !allowedLevels.Contains(level))
                return BadRequest(new { success = false, message = "Invalid achievement level" });
            if (request.AwardedAt > DateTime.UtcNow.AddDays(1))
                return BadRequest(new { success = false, message = "Awarded date cannot be in the future" });

            var eventKey = BadgeAwardWorker.Normalize(string.IsNullOrWhiteSpace(request.EventName) ? request.Title : request.EventName);
            var sourceKey = $"manual:{badgeId.ToLowerInvariant()}:{eventKey}";
            if (!request.AllowDuplicate && (student.EarnedBadges ?? new()).Any(b => string.Equals(b.SourceKey, sourceKey, StringComparison.OrdinalIgnoreCase)))
                return Conflict(new { success = false, message = "This badge has already been awarded for the same event" });

            string? certificateUrl = string.IsNullOrWhiteSpace(request.CertificateUrl) ? null : request.CertificateUrl.Trim();
            if (certificateUrl != null && (!Uri.TryCreate(certificateUrl, UriKind.Absolute, out var certificateUri) || certificateUri.Scheme is not ("http" or "https")))
                return BadRequest(new { success = false, message = "Certificate URL must use http or https" });
            string? savedCertificate = null;
            if (request.Certificate is { Length: > 0 })
            {
                if (request.Certificate.Length > 5 * 1024 * 1024) return BadRequest(new { success = false, message = "Certificate must be 5 MB or smaller" });
                var extension = Path.GetExtension(request.Certificate.FileName).ToLowerInvariant();
                if (extension is not (".pdf" or ".png" or ".jpg" or ".jpeg"))
                    return BadRequest(new { success = false, message = "Certificate must be a PDF, PNG or JPG file" });
                var directory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "certificates");
                Directory.CreateDirectory(directory);
                savedCertificate = Path.Combine(directory, $"{Guid.NewGuid():N}{extension}");
                await using var stream = System.IO.File.Create(savedCertificate);
                await request.Certificate.CopyToAsync(stream);
                certificateUrl = $"/certificates/{Path.GetFileName(savedCertificate)}";
            }

            var badge = new StudentBadge
            {
                BadgeId = badgeId.ToLowerInvariant(),
                SourceKey = request.AllowDuplicate ? $"{sourceKey}:{Guid.NewGuid():N}" : sourceKey,
                Type = badgeId,
                Name = request.Title.Trim(),
                Description = request.Description.Trim(),
                Category = category,
                EventName = string.IsNullOrWhiteSpace(request.EventName) ? null : request.EventName.Trim(),
                AwardedBy = string.IsNullOrWhiteSpace(request.AwardedBy) ? null : request.AwardedBy.Trim(),
                CertificateUrl = certificateUrl,
                Level = level,
                AwardedAt = request.AwardedAt ?? DateTime.UtcNow
            };
            var filter = Builders<Student>.Filter.Eq(s => s.Id, id);
            if (!request.AllowDuplicate)
                filter &= Builders<Student>.Filter.Not(Builders<Student>.Filter.ElemMatch(s => s.EarnedBadges, b => b.SourceKey == sourceKey));
            var result = await _mongoService.Students.UpdateOneAsync(filter, Builders<Student>.Update.Push(s => s.EarnedBadges, badge).Set(s => s.UpdatedAt, DateTime.UtcNow));
            if (result.ModifiedCount == 0)
            {
                if (savedCertificate != null) System.IO.File.Delete(savedCertificate);
                return Conflict(new { success = false, message = "This badge has already been awarded for the same event" });
            }
            return Ok(new { success = true, data = badge });
        }

        private async Task<bool> CanAccessBadgesAsync(Student student, bool awarding)
        {
            var userId = User.FindFirst("id")?.Value;
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            if (string.IsNullOrEmpty(userId)) return false;
            if (role == "student") return !awarding && student.Id == userId;
            if (role == "mentor")
            {
                var mentor = await _mongoService.Mentors.Find(m => m.Id == userId && m.Status == "approved").FirstOrDefaultAsync();
                return mentor != null && student.MentorId == mentor.Id;
            }
            if (role == "college-admin")
            {
                var admin = await _mongoService.Admins.Find(a => a.Id == userId && a.Status == "active").FirstOrDefaultAsync();
                return admin != null && !string.IsNullOrEmpty(admin.CollegeId) && admin.CollegeId == student.CollegeId;
            }
            if (role == "admin") return await _mongoService.Admins.Find(a => a.Id == userId && a.Status == "active").AnyAsync();
            return false;
        }

        [HttpGet("me/report-card/jobs")]
        [Authorize(Roles = "student")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> MyReportCardJobs()
        {
            var studentId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(studentId)) return Unauthorized();
            var student = await _mongoService.Students.Find(s => s.Id == studentId).FirstOrDefaultAsync();
            if (student == null) return NotFound(new { success = false, message = "Student not found" });
            var list = await _mongoService.ReportCardJobs.Find(j => j.StudentId == student.Id).SortByDescending(j => j.CreatedAt).ToListAsync();
            return Ok(new { success = true, data = list });
        }

        [HttpPost("{studentId}/report-card/generate")]
        public async Task<IActionResult> GenerateReportCardJob(string studentId)
        {
            var requesterId = User.FindFirst("id")?.Value ?? "system";
            var idempotencyKey = Request.Headers["Idempotency-Key"].FirstOrDefault() ?? Guid.NewGuid().ToString("N");
            var existingJob = await _mongoService.ReportCardJobs.Find(j => j.IdempotencyKey == idempotencyKey).FirstOrDefaultAsync();
            if (existingJob != null)
                return Ok(new { success = true, message = "Report card generation already queued.", jobId = existingJob.Id });

            var student = await _mongoService.Students.Find(s => s.Id == studentId).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }

            // Delete all previous report card jobs for this student (replace old with new)
            var oldJobs = await _mongoService.ReportCardJobs.Find(j => j.StudentId == studentId).ToListAsync();
            foreach (var oldJob in oldJobs)
            {
                // Delete old output file if it exists
                if (!string.IsNullOrEmpty(oldJob.OutputFile))
                {
                    var oldFilePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", oldJob.OutputFile.TrimStart('/'));
                    if (System.IO.File.Exists(oldFilePath))
                    {
                        System.IO.File.Delete(oldFilePath);
                    }
                }
            }
            await _mongoService.ReportCardJobs.DeleteManyAsync(j => j.StudentId == studentId);

            var job = new ReportCardJob
            {
                RequesterId = requesterId,
                IdempotencyKey = idempotencyKey,
                StudentId = studentId,
                StudentName = student.Name,
                Status = "pending",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            try { await _mongoService.ReportCardJobs.InsertOneAsync(job); }
            catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                var duplicate = await _mongoService.ReportCardJobs.Find(j => j.IdempotencyKey == idempotencyKey).FirstOrDefaultAsync();
                return Ok(new { success = true, message = "Report card generation already queued.", jobId = duplicate?.Id });
            }
            return Ok(new { success = true, message = "Report card generation queued. Previous report replaced.", jobId = job.Id });
        }

        [HttpGet("report-card/jobs/{jobId}")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> GetReportCardJob(string jobId)
        {
            var job = await _mongoService.ReportCardJobs.Find(j => j.Id == jobId).FirstOrDefaultAsync();
            if (job == null)
            {
                return NotFound(new { success = false, message = "Job not found" });
            }

            return Ok(new { success = true, data = job });
        }

        [HttpGet("{studentId}/report-card/jobs")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> ListStudentReportCardJobs(string studentId)
        {
            var list = await _mongoService.ReportCardJobs.Find(j => j.StudentId == studentId).SortByDescending(j => j.CreatedAt).ToListAsync();
            return Ok(new { success = true, data = list });
        }

        [HttpGet("report-card/download/{jobId}")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> DownloadReportCard(string jobId)
        {
            var job = await _mongoService.ReportCardJobs.Find(j => j.Id == jobId).FirstOrDefaultAsync();
            if (job == null)
            {
                return NotFound("Report card job not found.");
            }

            // 1. Try serving from database
            if (!string.IsNullOrEmpty(job.HtmlContent))
            {
                var bytes = System.Text.Encoding.UTF8.GetBytes(job.HtmlContent);
                var fileName = $"Report-Card-{job.StudentName.Replace(" ", "-")}.html";
                return File(bytes, "text/html", fileName);
            }

            // 2. Fallback to serving from local wwwroot/reports folder
            var localFileName = $"report-card-{job.StudentId}.html";
            var localFilePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "reports", localFileName);
            if (System.IO.File.Exists(localFilePath))
            {
                var bytes = await System.IO.File.ReadAllBytesAsync(localFilePath);
                var fileName = $"Report-Card-{job.StudentName.Replace(" ", "-")}.html";
                return File(bytes, "text/html", fileName);
            }

            return NotFound("Report card file not found in database or local storage.");
        }

        [HttpGet("report-card/download/{jobId}/pdf")]
        [EnableRateLimiting("data-fetch")]
        public async Task<IActionResult> DownloadReportCardPdf(string jobId)
        {
            var job = await _mongoService.ReportCardJobs.Find(j => j.Id == jobId).FirstOrDefaultAsync();
            if (job == null)
            {
                return NotFound("Report card job not found.");
            }

            var student = await _mongoService.Students.Find(s => s.Id == job.StudentId).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound("Student not found for this report card.");
            }

            var collegeName = "EduGuard Affiliated Institution";
            if (!string.IsNullOrEmpty(student.CollegeId))
            {
                var college = await _mongoService.Colleges.Find(c => c.Id == student.CollegeId).FirstOrDefaultAsync();
                if (college != null) collegeName = college.Name;
            }

            var pdfBytes = BuildStyledReportCardPdf(student, collegeName, job.Id ?? string.Empty);
            var fileName = $"Report-Card-{student.Name.Replace(" ", "-")}-{DateTime.UtcNow:yyyy-MM-dd}.pdf";

            return File(pdfBytes, "application/pdf", fileName);
        }

        private enum PdfBlockKind { Heading, Paragraph, BulletList, NumberedList, Table, Rule }

        private class PdfContentBlock
        {
            public PdfBlockKind Kind { get; set; }
            public string Text { get; set; } = string.Empty;
            public int Level { get; set; } = 1;
            public List<string> Items { get; set; } = new();
            public List<string> Headers { get; set; } = new();
            public List<List<string>> Rows { get; set; } = new();
        }

        private static byte[] BuildStyledReportCardPdf(Student student, string collegeName, string reportId)
        {
            const int pageWidth = 595;
            const int pageHeight = 842;
            const int margin = 34;
            const int contentWidth = pageWidth - (margin * 2);
            const int footerTop = 34;
            const int bodyBottom = 54;
            var pages = new List<StringBuilder>();
            var page = new StringBuilder();
            var y = 0;

            void NewPage()
            {
                page = new StringBuilder();
                pages.Add(page);
                y = 812;
                AddText(collegeName.ToUpperInvariant(), margin, y, 13, true, "1A365D");
                y -= 17;
                AddText("Academic Progress & Performance Report Card", margin, y, 10, false, "4A5568");
                y -= 10;
                AddLine(margin, y, pageWidth - margin, y, "CBD5E0");
                y -= 16;
            }

            void EnsureSpace(int height)
            {
                if (y - height < bodyBottom)
                {
                    NewPage();
                }
            }

            void AddText(string text, int x, int textY, int size = 10, bool bold = false, string color = "2D3748")
            {
                var safe = EscapePdfText(NormalizePdfText(text));
                var (r, g, b) = HexToRgb(color);
                page.AppendLine($"{r} {g} {b} rg");
                page.AppendLine($"BT /{(bold ? "F2" : "F1")} {size} Tf {x} {textY} Td ({safe}) Tj ET");
            }

            void AddRect(int x, int rectY, int width, int height, string stroke = "E2E8F0", string fill = "")
            {
                if (!string.IsNullOrEmpty(fill))
                {
                    var (fr, fg, fb) = HexToRgb(fill);
                    page.AppendLine($"{fr} {fg} {fb} rg");
                    page.AppendLine($"{x} {rectY} {width} {height} re f");
                }
                var (sr, sg, sb) = HexToRgb(stroke);
                page.AppendLine($"{sr} {sg} {sb} RG");
                page.AppendLine($"{x} {rectY} {width} {height} re S");
            }

            void AddLine(int x1, int y1, int x2, int y2, string color = "E2E8F0")
            {
                var (r, g, b) = HexToRgb(color);
                page.AppendLine($"{r} {g} {b} RG");
                page.AppendLine($"{x1} {y1} m {x2} {y2} l S");
            }

            void AddSectionTitle(string title)
            {
                EnsureSpace(24);
                AddText(title, margin, y, 11, true, "1A365D");
                y -= 7;
                AddLine(margin, y, pageWidth - margin, y, "CBD5E0");
                y -= 13;
            }

            NewPage();

            AddRect(margin, y - 82, contentWidth, 88, "E2E8F0", "F8FAFC");
            var leftX = margin + 12;
            var rightX = margin + 272;
            var infoY = y - 15;
            AddInfo("Student Name", student.Name, leftX, infoY);
            AddInfo("Roll Number", $"#{student.RollNo}", rightX, infoY);
            AddInfo("Course & Semester", $"{student.Course} (Semester {student.Semester})", leftX, infoY - 29);
            AddInfo("Assigned Class", student.Class, rightX, infoY - 29);
            AddInfo("Attendance Rate", student.Attendance.HasValue ? $"{student.Attendance}%" : "N/A", leftX, infoY - 58);
            AddInfo("Risk Evaluation Status", $"{student.RiskLevel} Risk", rightX, infoY - 58);
            y -= 104;

            void AddInfo(string label, string value, int x, int infoTextY)
            {
                AddText(label.ToUpperInvariant(), x, infoTextY, 7, true, "718096");
                AddText(value, x, infoTextY - 11, 9, true, "2D3748");
            }

            AddSectionTitle("Subject-wise Performance Record");
            AddSubjectTable();

            AddSectionTitle("Grading Scale");
            RenderTable(
                new List<string> { "Marks Range", "Grade" },
                new List<List<string>>
                {
                    new() { "91 - 100", "A1" },
                    new() { "81 - 90", "A2" },
                    new() { "71 - 80", "B1" },
                    new() { "61 - 70", "B2" },
                    new() { "51 - 60", "C1" },
                    new() { "41 - 50", "C2" },
                    new() { "33 - 40", "D" },
                    new() { "Below 33", "E" },
                },
                new[] { 150, 70 });

            AddSignatures();
            AddPageFooters();
            return BuildPdfDocument(pages, pageWidth, pageHeight);

            void AddPageFooters()
            {
                for (var i = 0; i < pages.Count; i++)
                {
                    var current = pages[i];
                    page = current;
                    AddLine(margin, footerTop, pageWidth - margin, footerTop, "E2E8F0");
                    AddText("Generated by EduGuard", margin, 20, 7, false, "718096");
                    AddText($"Report ID: {reportId}", margin + 135, 20, 7, false, "718096");
                    AddText($"Generation Date: {DateTime.UtcNow:yyyy-MM-dd}", margin + 270, 20, 7, false, "718096");
                    AddText($"Page {i + 1} of {pages.Count}", pageWidth - margin - 54, 20, 7, false, "718096");
                }
            }

            void AddSubjectTable()
            {
                var colWidths = new[] { 124, 108, 78, 82, 74, 54 };
                var headers = new[] { "Subject", "Class Tests", "Mid Term", "House Exam", "Total", "Grade" };

                EnsureSpace(42);
                if (student.Marks == null || student.Marks.Count == 0)
                {
                    RenderTable(headers.ToList(), new List<List<string>> { new() { "No academic marks recorded for this semester yet.", "", "", "", "", "" } }, colWidths);
                    return;
                }

                var rows = new List<List<string>>();
                foreach (var mark in student.Marks)
                {
                    var midTermMarks = mark.MidTerm?.Marks;
                    var midTermMax = mark.MidTerm?.MaxMarks ?? 100;
                    var houseExamMarks = mark.HouseExam?.Marks;
                    var houseExamMax = mark.HouseExam?.MaxMarks ?? 100;
                    var midTermStr = midTermMarks.HasValue ? $"{midTermMarks}/{midTermMax}" : "N/A";
                    var houseExamStr = houseExamMarks.HasValue ? $"{houseExamMarks}/{houseExamMax}" : "N/A";
                    var testsStr = "No Tests";
                    double totalMarks = 0;
                    double totalMax = 0;

                    if (mark.ClassTests != null && mark.ClassTests.Count > 0)
                    {
                        testsStr = string.Join(", ", mark.ClassTests.Select(t => $"{t.Marks}/{t.MaxMarks}"));
                        totalMarks += mark.ClassTests.Sum(t => t.Marks);
                        totalMax += mark.ClassTests.Sum(t => t.MaxMarks);
                    }

                    if (midTermMarks.HasValue)
                    {
                        totalMarks += midTermMarks.Value;
                        totalMax += midTermMax;
                    }

                    if (houseExamMarks.HasValue)
                    {
                        totalMarks += houseExamMarks.Value;
                        totalMax += houseExamMax;
                    }

                    var percentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
                    var grade = percentage >= 91 ? "A1" : percentage >= 81 ? "A2" : percentage >= 71 ? "B1" : percentage >= 61 ? "B2" : percentage >= 51 ? "C1" : percentage >= 41 ? "C2" : percentage >= 33 ? "D" : "E";
                    rows.Add(new List<string> { mark.SubjectName, testsStr, midTermStr, houseExamStr, $"{totalMarks}/{totalMax}", grade });
                }

                RenderTable(headers.ToList(), rows, colWidths);
                y -= 8;
            }

            void RenderTable(List<string> headers, List<List<string>> rows, int[] colWidths)
            {
                if (headers.Count == 0) return;
                var tableWidth = colWidths.Sum();
                var normalizedRows = rows.Select(row => headers.Select((_, index) => index < row.Count ? row[index] : "").ToList()).ToList();

                void RenderHeader()
                {
                    EnsureSpace(23);
                    AddRect(margin, y - 19, tableWidth, 21, "CBD5E0", "EDF2F7");
                    var x = margin;
                    for (var i = 0; i < headers.Count; i++)
                    {
                        AddText(TruncatePdfText(headers[i], Math.Max(8, colWidths[i] / 6)), x + 5, y - 13, 7, true, "2D3748");
                        x += colWidths[i];
                    }
                    y -= 21;
                }

                RenderHeader();
                for (var rowIndex = 0; rowIndex < normalizedRows.Count; rowIndex++)
                {
                    var row = normalizedRows[rowIndex];
                    var cellLines = row.Select((cell, index) => WrapPdfLine(StripMarkdownInline(cell), Math.Max(8, (colWidths[index] - 12) / 5)).ToList()).ToList();
                    var lineCount = Math.Max(1, cellLines.Max(lines => lines.Count()));
                    var rowHeight = Math.Max(22, 9 + (lineCount * 10));

                    if (y - rowHeight < bodyBottom)
                    {
                        NewPage();
                        RenderHeader();
                    }

                    AddRect(margin, y - rowHeight + 2, tableWidth, rowHeight, "E2E8F0", rowIndex % 2 == 0 ? "FFFFFF" : "F8FAFC");
                    var x = margin;
                    for (var cellIndex = 0; cellIndex < row.Count; cellIndex++)
                    {
                        var lineY = y - 12;
                        foreach (var line in cellLines[cellIndex])
                        {
                            AddText(line, x + 5, lineY, 7, cellIndex == 0, "2D3748");
                            lineY -= 9;
                        }
                        x += colWidths[cellIndex];
                    }
                    y -= rowHeight;
                }
            }

            void AddSignatures()
            {
                EnsureSpace(48);
                y -= 16;
                var signatureY = y;
                AddLine(margin + 20, signatureY, margin + 190, signatureY, "CBD5E0");
                AddLine(pageWidth - margin - 190, signatureY, pageWidth - margin - 20, signatureY, "CBD5E0");
                AddText("Class Teacher", margin + 64, signatureY - 13, 8, false, "718096");
                AddText("Principal / HOD", pageWidth - margin - 150, signatureY - 13, 8, false, "718096");
                y -= 30;
            }
        }

        private static byte[] BuildPdfDocument(List<StringBuilder> pageContents, int pageWidth, int pageHeight)
        {
            var objects = new List<string>
            {
                "<< /Type /Catalog /Pages 2 0 R >>"
            };

            var pageObjectNumbers = new List<int>();
            var contentObjectNumbers = new List<int>();
            var fontRegularObjectNumber = 3 + (pageContents.Count * 2);
            var fontBoldObjectNumber = fontRegularObjectNumber + 1;
            var nextObjectNumber = 3;

            foreach (var _ in pageContents)
            {
                pageObjectNumbers.Add(nextObjectNumber++);
                contentObjectNumbers.Add(nextObjectNumber++);
            }

            objects.Add($"<< /Type /Pages /Kids [{string.Join(" ", pageObjectNumbers.Select(n => $"{n} 0 R"))}] /Count {pageContents.Count} >>");

            for (var pageIndex = 0; pageIndex < pageContents.Count; pageIndex++)
            {
                objects.Add($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pageWidth} {pageHeight}] /Resources << /Font << /F1 {fontRegularObjectNumber} 0 R /F2 {fontBoldObjectNumber} 0 R >> >> /Contents {contentObjectNumbers[pageIndex]} 0 R >>");
                var contentText = pageContents[pageIndex].ToString();
                objects.Add($"<< /Length {Encoding.ASCII.GetByteCount(contentText)} >>\nstream\n{contentText}endstream");
            }

            objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
            objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

            var pdf = new StringBuilder();
            var offsets = new List<int> { 0 };
            pdf.Append("%PDF-1.4\n");

            for (var i = 0; i < objects.Count; i++)
            {
                offsets.Add(Encoding.ASCII.GetByteCount(pdf.ToString()));
                pdf.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
            }

            var xrefOffset = Encoding.ASCII.GetByteCount(pdf.ToString());
            pdf.Append($"xref\n0 {objects.Count + 1}\n");
            pdf.Append("0000000000 65535 f \n");
            for (var i = 1; i < offsets.Count; i++)
            {
                pdf.Append($"{offsets[i]:D10} 00000 n \n");
            }

            pdf.Append($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF");
            return Encoding.ASCII.GetBytes(pdf.ToString());
        }

        private static (string R, string G, string B) HexToRgb(string hex)
        {
            hex = hex.TrimStart('#');
            if (hex.Length != 6)
            {
                hex = "2D3748";
            }

            var r = Convert.ToInt32(hex[..2], 16) / 255.0;
            var g = Convert.ToInt32(hex.Substring(2, 2), 16) / 255.0;
            var b = Convert.ToInt32(hex.Substring(4, 2), 16) / 255.0;
            return (r.ToString("0.###"), g.ToString("0.###"), b.ToString("0.###"));
        }

        private static string NormalizePdfText(string text)
        {
            return WebUtility.HtmlDecode(text ?? string.Empty)
                .Replace("\r", " ")
                .Replace("\n", " ")
                .Replace("•", "-")
                .Replace("–", "-")
                .Replace("—", "-")
                .Replace("“", "\"")
                .Replace("”", "\"")
                .Replace("’", "'");
        }

        private static string TruncatePdfText(string text, int maxLength)
        {
            text = NormalizePdfText(text);
            if (text.Length <= maxLength) return text;
            return text[..Math.Max(0, maxLength - 3)].TrimEnd() + "...";
        }

        private static List<PdfContentBlock> ParseAiBlocks(string rawContent)
        {
            var content = NormalizeAiContent(rawContent);
            if (string.IsNullOrWhiteSpace(content))
            {
                return new List<PdfContentBlock>();
            }

            var jsonBlocks = TryParseJsonBlocks(content);
            if (jsonBlocks.Count > 0)
            {
                return jsonBlocks;
            }

            content = ConvertBasicHtmlToMarkdown(content);
            var lines = content.Replace("\r\n", "\n").Split('\n');
            var blocks = new List<PdfContentBlock>();
            var paragraph = new List<string>();

            void FlushParagraph()
            {
                var text = StripMarkdownInline(string.Join(" ", paragraph).Trim());
                if (!string.IsNullOrWhiteSpace(text))
                {
                    blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.Paragraph, Text = text });
                }
                paragraph.Clear();
            }

            for (var i = 0; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrWhiteSpace(line))
                {
                    FlushParagraph();
                    continue;
                }

                if (IsMarkdownTableStart(lines, i))
                {
                    FlushParagraph();
                    var headers = ParseMarkdownTableRow(lines[i]);
                    i += 2;
                    var rows = new List<List<string>>();
                    while (i < lines.Length && lines[i].Contains('|') && !string.IsNullOrWhiteSpace(lines[i]))
                    {
                        rows.Add(ParseMarkdownTableRow(lines[i]).Select(StripMarkdownInline).ToList());
                        i++;
                    }
                    i--;
                    blocks.Add(new PdfContentBlock
                    {
                        Kind = PdfBlockKind.Table,
                        Headers = headers.Select(StripMarkdownInline).ToList(),
                        Rows = rows
                    });
                    continue;
                }

                if (Regex.IsMatch(line, @"^#{1,6}\s+"))
                {
                    FlushParagraph();
                    var level = line.TakeWhile(c => c == '#').Count();
                    blocks.Add(new PdfContentBlock
                    {
                        Kind = PdfBlockKind.Heading,
                        Level = level,
                        Text = StripMarkdownInline(Regex.Replace(line, @"^#{1,6}\s+", ""))
                    });
                    continue;
                }

                if (Regex.IsMatch(line, @"^(-{3,}|\*{3,}|_{3,})$"))
                {
                    FlushParagraph();
                    blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.Rule });
                    continue;
                }

                if (Regex.IsMatch(line, @"^[-*+]\s+"))
                {
                    FlushParagraph();
                    var items = new List<string>();
                    while (i < lines.Length && Regex.IsMatch(lines[i].Trim(), @"^[-*+]\s+"))
                    {
                        items.Add(StripMarkdownInline(Regex.Replace(lines[i].Trim(), @"^[-*+]\s+", "")));
                        i++;
                    }
                    i--;
                    blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.BulletList, Items = items });
                    continue;
                }

                if (Regex.IsMatch(line, @"^\d+[\.)]\s+"))
                {
                    FlushParagraph();
                    var items = new List<string>();
                    while (i < lines.Length && Regex.IsMatch(lines[i].Trim(), @"^\d+[\.)]\s+"))
                    {
                        items.Add(StripMarkdownInline(Regex.Replace(lines[i].Trim(), @"^\d+[\.)]\s+", "")));
                        i++;
                    }
                    i--;
                    blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.NumberedList, Items = items });
                    continue;
                }

                paragraph.Add(line);
            }

            FlushParagraph();
            return blocks.Count > 0
                ? blocks
                : new List<PdfContentBlock> { new() { Kind = PdfBlockKind.Paragraph, Text = StripMarkdownInline(content) } };
        }

        private static List<PdfContentBlock> TryParseJsonBlocks(string content)
        {
            var blocks = new List<PdfContentBlock>();
            var trimmed = content.Trim();
            if (!trimmed.StartsWith("{") && !trimmed.StartsWith("["))
            {
                return blocks;
            }

            try
            {
                using var doc = JsonDocument.Parse(trimmed);
                FlattenJsonElement(doc.RootElement, "AI Study Plan", blocks);
            }
            catch
            {
                blocks.Clear();
            }

            return blocks;
        }

        private static void FlattenJsonElement(JsonElement element, string title, List<PdfContentBlock> blocks)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.Heading, Level = 2, Text = HumanizeKey(title) });
                    foreach (var property in element.EnumerateObject())
                    {
                        FlattenJsonElement(property.Value, property.Name, blocks);
                    }
                    break;
                case JsonValueKind.Array:
                    var scalarItems = element.EnumerateArray()
                        .Where(item => item.ValueKind is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
                        .Select(item => StripMarkdownInline(item.ToString()))
                        .Where(item => !string.IsNullOrWhiteSpace(item))
                        .ToList();
                    if (scalarItems.Count > 0)
                    {
                        blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.Heading, Level = 3, Text = HumanizeKey(title) });
                        blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.BulletList, Items = scalarItems });
                    }
                    else
                    {
                        blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.Heading, Level = 3, Text = HumanizeKey(title) });
                        foreach (var item in element.EnumerateArray())
                        {
                            FlattenJsonElement(item, title, blocks);
                        }
                    }
                    break;
                default:
                    var value = StripMarkdownInline(element.ToString());
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        blocks.Add(new PdfContentBlock { Kind = PdfBlockKind.Paragraph, Text = $"{HumanizeKey(title)}: {value}" });
                    }
                    break;
            }
        }

        private static string HumanizeKey(string key)
        {
            key = Regex.Replace(key ?? string.Empty, "([a-z])([A-Z])", "$1 $2");
            key = key.Replace("_", " ").Replace("-", " ").Trim();
            return string.IsNullOrWhiteSpace(key)
                ? "Section"
                : char.ToUpperInvariant(key[0]) + key[1..];
        }

        private static string NormalizeAiContent(string content)
        {
            return WebUtility.HtmlDecode(content ?? string.Empty)
                .Replace("\r\n", "\n")
                .Replace("\r", "\n")
                .Replace("â€¢", "-")
                .Replace("â€“", "-")
                .Replace("â€”", "-")
                .Replace("â€œ", "\"")
                .Replace("â€", "\"")
                .Replace("â€™", "'");
        }

        private static string ConvertBasicHtmlToMarkdown(string content)
        {
            if (!Regex.IsMatch(content, "<[a-zA-Z][^>]*>"))
            {
                return content;
            }

            content = Regex.Replace(content, @"<\s*h1[^>]*>(.*?)<\s*/\s*h1\s*>", "\n# $1\n", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            content = Regex.Replace(content, @"<\s*h2[^>]*>(.*?)<\s*/\s*h2\s*>", "\n## $1\n", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            content = Regex.Replace(content, @"<\s*h3[^>]*>(.*?)<\s*/\s*h3\s*>", "\n### $1\n", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            content = Regex.Replace(content, @"<\s*li[^>]*>(.*?)<\s*/\s*li\s*>", "\n- $1", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            content = Regex.Replace(content, @"<\s*br\s*/?\s*>", "\n", RegexOptions.IgnoreCase);
            content = Regex.Replace(content, @"<\s*/\s*p\s*>", "\n\n", RegexOptions.IgnoreCase);
            content = Regex.Replace(content, @"<[^>]+>", " ", RegexOptions.Singleline);
            return WebUtility.HtmlDecode(content);
        }

        private static bool IsMarkdownTableStart(string[] lines, int index)
        {
            if (index + 1 >= lines.Length) return false;
            return lines[index].Contains('|') && Regex.IsMatch(lines[index + 1].Trim(), @"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$");
        }

        private static List<string> ParseMarkdownTableRow(string line)
        {
            var trimmed = line.Trim().Trim('|');
            return trimmed.Split('|').Select(cell => cell.Trim()).ToList();
        }

        private static string StripMarkdownInline(string text)
        {
            text = NormalizeAiContent(text);
            text = Regex.Replace(text, @"`([^`]*)`", "$1");
            text = Regex.Replace(text, @"\*\*([^*]+)\*\*", "$1");
            text = Regex.Replace(text, @"__([^_]+)__", "$1");
            text = Regex.Replace(text, @"\*([^*]+)\*", "$1");
            text = Regex.Replace(text, @"_([^_]+)_", "$1");
            text = Regex.Replace(text, @"!\[([^\]]*)\]\([^)]+\)", "$1");
            text = Regex.Replace(text, @"\[([^\]]+)\]\([^)]+\)", "$1");
            text = Regex.Replace(text, @"^\s*#{1,6}\s*", "");
            text = Regex.Replace(text, @"^\s*[-*+]\s+", "");
            text = Regex.Replace(text, @"^\s*\d+[\.)]\s+", "");
            text = text.Replace("|", " ");
            return Regex.Replace(text, @"\s+", " ").Trim();
        }

        private static List<string> BuildReportCardPdfLines(Student student, string collegeName, string reportId)
        {
            var lines = new List<string>
            {
                collegeName.ToUpperInvariant(),
                "Academic Progress & Performance Report Card",
                "",
                $"Student Name: {student.Name}",
                $"Roll Number: #{student.RollNo}",
                $"Course & Semester: {student.Course} (Semester {student.Semester})",
                $"Assigned Class: {student.Class}",
                $"Attendance Rate: {(student.Attendance.HasValue ? $"{student.Attendance}%" : "N/A")}",
                $"Risk Evaluation Status: {student.RiskLevel} Risk",
                "",
                "Subject-wise Performance Record",
                "Subject | Class Tests | Mid Term | House Exam | Total | Grade"
            };

            if (student.Marks != null && student.Marks.Count > 0)
            {
                foreach (var mark in student.Marks)
                {
                    var midTermMarks = mark.MidTerm?.Marks;
                    var midTermMax = mark.MidTerm?.MaxMarks ?? 100;
                    var houseExamMarks = mark.HouseExam?.Marks;
                    var houseExamMax = mark.HouseExam?.MaxMarks ?? 100;
                    var midTermStr = midTermMarks.HasValue ? $"{midTermMarks}/{midTermMax}" : "N/A";
                    var houseExamStr = houseExamMarks.HasValue ? $"{houseExamMarks}/{houseExamMax}" : "N/A";
                    var testsStr = "No Tests";
                    double totalMarks = 0;
                    double totalMax = 0;

                    if (mark.ClassTests != null && mark.ClassTests.Count > 0)
                    {
                        testsStr = string.Join(", ", mark.ClassTests.Select(t => $"{t.Marks}/{t.MaxMarks}"));
                        totalMarks += mark.ClassTests.Sum(t => t.Marks);
                        totalMax += mark.ClassTests.Sum(t => t.MaxMarks);
                    }

                    if (midTermMarks.HasValue)
                    {
                        totalMarks += midTermMarks.Value;
                        totalMax += midTermMax;
                    }

                    if (houseExamMarks.HasValue)
                    {
                        totalMarks += houseExamMarks.Value;
                        totalMax += houseExamMax;
                    }

                    var percentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
                    var grade = percentage >= 91 ? "A1" : percentage >= 81 ? "A2" : percentage >= 71 ? "B1" : percentage >= 61 ? "B2" : percentage >= 51 ? "C1" : percentage >= 41 ? "C2" : percentage >= 33 ? "D" : "E";
                    lines.Add($"{mark.SubjectName} | {testsStr} | {midTermStr} | {houseExamStr} | {totalMarks}/{totalMax} | {grade}");
                }
            }
            else
            {
                lines.Add("No academic marks recorded for this semester yet.");
            }

            lines.Add("");
            lines.Add("Risk Factor Diagnostics");
            lines.Add(string.IsNullOrWhiteSpace(student.RiskExplanation) ? "No detailed risk diagnosis is generated yet." : student.RiskExplanation);
            lines.Add("");
            lines.Add("Academic Remedial Study Plan");
            lines.Add(string.IsNullOrWhiteSpace(student.AiImprovementPlan) ? "No study improvement plan generated yet." : student.AiImprovementPlan);
            lines.Add("");
            lines.Add("Grading Scale: 91-100 A1, 81-90 A2, 71-80 B1, 61-70 B2, 51-60 C1, 41-50 C2, 33-40 D, Below 33 E");
            lines.Add("");
            lines.Add($"Generated automatically by EduGuard | Report Card ID: {reportId} | Date: {DateTime.UtcNow:yyyy-MM-dd}");

            return lines;
        }

        private static byte[] BuildSimplePdf(List<string> sourceLines)
        {
            const int pageWidth = 595;
            const int pageHeight = 842;
            const int left = 42;
            const int top = 800;
            const int bottom = 48;
            const int lineHeight = 15;
            const int maxChars = 92;

            var wrappedLines = sourceLines
                .SelectMany(line => WrapPdfLine(WebUtility.HtmlDecode(line), maxChars))
                .ToList();

            var linesPerPage = Math.Max(1, (top - bottom) / lineHeight);
            var pages = wrappedLines
                .Select((line, index) => new { line, index })
                .GroupBy(item => item.index / linesPerPage)
                .Select(group => group.Select(item => item.line).ToList())
                .ToList();

            if (pages.Count == 0)
            {
                pages.Add(new List<string> { "Report card is empty." });
            }

            var objects = new List<string>();
            objects.Add("<< /Type /Catalog /Pages 2 0 R >>");

            var pageObjectNumbers = new List<int>();
            var contentObjectNumbers = new List<int>();
            var nextObjectNumber = 3;

            foreach (var _ in pages)
            {
                pageObjectNumbers.Add(nextObjectNumber++);
                contentObjectNumbers.Add(nextObjectNumber++);
            }

            objects.Add($"<< /Type /Pages /Kids [{string.Join(" ", pageObjectNumbers.Select(n => $"{n} 0 R"))}] /Count {pages.Count} >>");

            for (var pageIndex = 0; pageIndex < pages.Count; pageIndex++)
            {
                var pageObject = $"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pageWidth} {pageHeight}] /Resources << /Font << /F1 {nextObjectNumber} 0 R >> >> /Contents {contentObjectNumbers[pageIndex]} 0 R >>";
                objects.Add(pageObject);

                var content = new StringBuilder();
                var y = top;
                foreach (var line in pages[pageIndex])
                {
                    var fontSize = line == line.ToUpperInvariant() && line.Length > 8 ? 13 : 10;
                    content.AppendLine($"BT /F1 {fontSize} Tf {left} {y} Td ({EscapePdfText(line)}) Tj ET");
                    y -= lineHeight;
                }

                var contentText = content.ToString();
                objects.Add($"<< /Length {Encoding.ASCII.GetByteCount(contentText)} >>\nstream\n{contentText}endstream");
            }

            objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

            var pdf = new StringBuilder();
            var offsets = new List<int> { 0 };
            pdf.Append("%PDF-1.4\n");

            for (var i = 0; i < objects.Count; i++)
            {
                offsets.Add(Encoding.ASCII.GetByteCount(pdf.ToString()));
                pdf.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
            }

            var xrefOffset = Encoding.ASCII.GetByteCount(pdf.ToString());
            pdf.Append($"xref\n0 {objects.Count + 1}\n");
            pdf.Append("0000000000 65535 f \n");
            for (var i = 1; i < offsets.Count; i++)
            {
                pdf.Append($"{offsets[i]:D10} 00000 n \n");
            }

            pdf.Append($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF");
            return Encoding.ASCII.GetBytes(pdf.ToString());
        }

        private static IEnumerable<string> WrapPdfLine(string line, int maxChars)
        {
            line = (line ?? string.Empty)
                .Replace("\r", " ")
                .Replace("\n", " ")
                .Trim();

            if (line.Length <= maxChars)
            {
                yield return line;
                yield break;
            }

            while (line.Length > maxChars)
            {
                var splitAt = line.LastIndexOf(' ', maxChars);
                if (splitAt <= 0) splitAt = maxChars;
                yield return line[..splitAt].Trim();
                line = line[splitAt..].Trim();
            }

            if (line.Length > 0)
            {
                yield return line;
            }
        }

        private static string EscapePdfText(string text)
        {
            return text
                .Replace("\\", "\\\\")
                .Replace("(", "\\(")
                .Replace(")", "\\)")
                .Replace("\t", "    ");
        }
    }

    public class StudyPlannerRequest
    {
        public string WeakSubjects { get; set; } = string.Empty;
        public string LearningSpeed { get; set; } = string.Empty;
        public string UpcomingExams { get; set; } = string.Empty;
    }

    public class GradeRequest
    {
        public string Grade { get; set; } = string.Empty;
        public string Feedback { get; set; } = string.Empty;
    }

    public class ApproveStudentRequest
    {
        public bool Approve { get; set; }
    }

    public class StudentUpdatePayload
    {
        public string? Name { get; set; }
        public string? Email { get; set; }
        public string? PhoneNo { get; set; }
        public double? Attendance { get; set; }
        public string? Behavior { get; set; }
        public List<string>? Contribution { get; set; }
        public List<SubjectMarks>? Marks { get; set; }
        public string? AiImprovementPlan { get; set; }
        public string? RiskExplanation { get; set; }
    }

    public class SelectMentorPayload
    {
        public string MentorId { get; set; } = string.Empty;
    }

    public class AwardBadgeRequest
    {
        public string BadgeId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string? EventName { get; set; }
        public string? Level { get; set; }
        public DateTime? AwardedAt { get; set; }
        public string? AwardedBy { get; set; }
        public string? CertificateUrl { get; set; }
        public IFormFile? Certificate { get; set; }
        public bool AllowDuplicate { get; set; }
    }
}
