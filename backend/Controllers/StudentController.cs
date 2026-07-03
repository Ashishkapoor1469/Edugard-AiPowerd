using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
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
        private readonly NvidiaNimService _nvidiaNimService;

        public StudentController(
            MongoService mongoService,
            ExcelParserService excelParserService,
            EmailQueueService emailQueueService,
            NotificationService notificationService,
            NvidiaNimService nvidiaNimService)
        {
            _mongoService = mongoService;
            _excelParserService = excelParserService;
            _emailQueueService = emailQueueService;
            _notificationService = notificationService;
            _nvidiaNimService = nvidiaNimService;
        }

        [HttpGet]
        public async Task<IActionResult> GetStudents(
            [FromQuery] int page = 1,
            [FromQuery] int limit = 8,
            [FromQuery] string? course = null,
            [FromQuery] string? @class = null,
            [FromQuery] string? search = null,
            [FromQuery] string? riskLevel = null,
            [FromQuery] string? collegeId = null,
            [FromQuery] string? courseId = null)
        {
            page = Math.Max(1, page);
            limit = Math.Clamp(limit, 1, 100);

            var filters = new List<FilterDefinition<Student>>();

            // Role-based visibility check: Mentors can only see their assigned students
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

            var total = await _mongoService.Students.CountDocumentsAsync(filter);
            var students = await _mongoService.Students
                .Find(filter)
                .SortByDescending(s => s.RiskScore)
                .ThenBy(s => s.Name)
                .Skip((page - 1) * limit)
                .Limit(limit)
                .ToListAsync();

            return Ok(new
            {
                success = true,
                count = students.Count,
                total,
                pages = (int)Math.Ceiling(total / (double)limit),
                data = students
            });
        }

        [HttpGet("stats")]
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
                        student = new Student
                        {
                            RollNo = row.RollNo,
                            Name = row.Name,
                            Email = row.Email,
                            PhoneNo = row.PhoneNo,
                            IsVerified = false,
                            VerificationToken = verificationToken,
                            CollegeId = currentMentor?.CollegeId,
                            CourseId = currentMentor?.AssignedCourseId,
                            Course = currentMentor?.Department ?? "BCA", // resolved from mentor department
                            Class = currentMentor?.AssignedClasses?.FirstOrDefault() ?? "BCA-A",
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
        public async Task<IActionResult> GetStudentsByClass(string className)
        {
            var students = await _mongoService.Students.Find(s => s.Class == className).ToListAsync();
            return Ok(new { success = true, data = students });
        }

        [HttpGet("class/{className}/summary")]
        public async Task<IActionResult> GetClassSummary(string className)
        {
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var userId = User.FindFirst("id")?.Value;

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

            var aiSummary = await _nvidiaNimService.GenerateClassSummaryAsync(stats);

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
                    aiSummary
                }
            });
        }

        private async Task<object> MapToProfileDto(Student student)
        {
            object? mentorInfo = null;
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
                // Fallback to EduGard AI Assistant details
                mentorInfo = new
                {
                    _id = "ai-assistant",
                    name = "EduGard AI Assistant",
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

            // Reset AI cache
            student.RiskExplanation = string.Empty;
            student.AiImprovementPlan = string.Empty;
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
            await _mongoService.Assignments.InsertOneAsync(model);
            return Ok(new { success = true, data = model });
        }

        [HttpGet("assignments")]
        public async Task<IActionResult> ListAssignments([FromQuery] string courseId, [FromQuery] string @class)
        {
            var filter = Builders<Assignment>.Filter.Eq(a => a.CourseId, courseId) & Builders<Assignment>.Filter.Eq(a => a.Class, @class);
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
        public async Task<IActionResult> ListSubmissions(string assignmentId)
        {
            var list = await _mongoService.Submissions.Find(s => s.AssignmentId == assignmentId).ToListAsync();
            return Ok(new { success = true, data = list });
        }

        [HttpPost("submissions/{submissionId}/grade")]
        public async Task<IActionResult> GradeSubmission(string submissionId, [FromBody] GradeRequest request)
        {
            if (request == null) return BadRequest("Grade and feedback are required");
            
            var filter = Builders<Submission>.Filter.Eq(s => s.Id, submissionId);
            var update = Builders<Submission>.Update
                .Set(s => s.Grade, request.Grade)
                .Set(s => s.Feedback, request.Feedback)
                .Set(s => s.UpdatedAt, DateTime.UtcNow);

            var result = await _mongoService.Submissions.UpdateOneAsync(filter, update);
            if (result.MatchedCount == 0) return NotFound("Submission not found");

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
    }

    public class SelectMentorPayload
    {
        public string MentorId { get; set; } = string.Empty;
    }
}
