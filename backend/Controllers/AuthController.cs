using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using BCrypt.Net;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly MongoService _mongoService;
        private readonly EmailQueueService _emailQueueService;
        private readonly string _jwtSecret;
        private readonly IConfiguration _configuration;

        public AuthController(MongoService mongoService, IConfiguration configuration, EmailQueueService emailQueueService)
        {
            _mongoService = mongoService;
            _emailQueueService = emailQueueService;
            _configuration = configuration;
            _jwtSecret = configuration.GetValue<string>("JWT_SECRET") ?? throw new InvalidOperationException("JWT_SECRET is required.");
        }

        private string GenerateJwtToken(string userId, string role = "mentor")
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = SHA256.HashData(Encoding.UTF8.GetBytes(_jwtSecret));
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[] 
                { 
                    new Claim("id", userId),
                    new Claim(ClaimTypes.Role, role)
                }),
                Expires = DateTime.UtcNow.AddDays(30),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        private string GenerateLmsToken(string userId, string role, string collegeId, string name, string email)
        {
            var key = SHA256.HashData(Encoding.UTF8.GetBytes(_jwtSecret));
            var descriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim("id", userId), new Claim(ClaimTypes.Role, role), new Claim("collegeId", collegeId),
                    new Claim("name", name), new Claim("email", email)
                }),
                Issuer = "eduguard",
                Audience = "eduguard-lms",
                Expires = DateTime.UtcNow.AddMinutes(5),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityTokenHandler().CreateToken(descriptor));
        }

        private void SetTokenCookies(string accessToken, string refreshToken)
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = true, // Force secure in modern environments
                SameSite = SameSiteMode.None, // Allow cross-origin dev testing
                Expires = DateTime.UtcNow.AddDays(30)
            };
            Response.Cookies.Append("access_token", accessToken, cookieOptions);
            Response.Cookies.Append("refresh_token", refreshToken, cookieOptions);
        }

        private string GenerateRefreshToken()
        {
            var randomNumber = new byte[32];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomNumber);
            return Convert.ToBase64String(randomNumber);
        }

        // --- MENTOR REGISTER (Pending Verification) ---
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] Mentor model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.Email) ||
                string.IsNullOrEmpty(model.Password) || string.IsNullOrEmpty(model.CollegeId) ||
                string.IsNullOrEmpty(model.AssignedCourseId))
            {
                return BadRequest(new { success = false, message = "Please provide name, email, password, college, and degree" });
            }

            model.Email = model.Email.Trim().ToLower();
            model.CollegeId = model.CollegeId.Trim();
            model.AssignedCourseId = model.AssignedCourseId.Trim();

            // Check if mentor already exists
            var existing = await _mongoService.Mentors.Find(m => m.Email == model.Email).FirstOrDefaultAsync();
            if (existing != null)
            {
                return BadRequest(new { success = false, message = "Email is already registered" });
            }

            var college = await _mongoService.Colleges.Find(c => c.Id == model.CollegeId).FirstOrDefaultAsync();
            if (college == null)
            {
                return BadRequest(new { success = false, message = "Selected college does not exist" });
            }

            if (college.IsBlocked)
            {
                return BadRequest(new { success = false, message = "Selected college is currently blocked" });
            }

            var degree = await _mongoService.Degrees.Find(d => d.Id == model.AssignedCourseId && d.CollegeId == model.CollegeId).FirstOrDefaultAsync();
            if (degree == null)
            {
                return BadRequest(new { success = false, message = "Selected degree does not belong to the selected college" });
            }

            // Hash password and set initial pending status
            model.Password = BCrypt.Net.BCrypt.HashPassword(model.Password);
            model.Role = "mentor";
            model.Status = "pending_verification"; // Mandatory verification required
            model.AssignedClasses ??= new();
            model.IsOnline = false;
            model.CreatedAt = DateTime.UtcNow;
            model.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Mentors.InsertOneAsync(model);

            return StatusCode(201, new
            {
                success = true,
                message = "Registration successful. Your account is pending administrator approval."
            });
        }

        [HttpPost("student/signup")]
        public async Task<IActionResult> StudentSignup([FromBody] StudentSignupRequest model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.Email) || 
                string.IsNullOrEmpty(model.Password) || string.IsNullOrEmpty(model.RollNo) || 
                string.IsNullOrEmpty(model.CollegeId) || string.IsNullOrEmpty(model.CourseId) || 
                string.IsNullOrEmpty(model.Section) || string.IsNullOrEmpty(model.MentorId))
            {
                return BadRequest(new { success = false, message = "All fields are required" });
            }

            model.Email = model.Email.Trim().ToLower();
            model.Section = model.Section.Trim().ToUpper();

            var degree = await _mongoService.Degrees.Find(d => d.Id == model.CourseId && d.CollegeId == model.CollegeId).FirstOrDefaultAsync();
            if (degree == null)
            {
                return BadRequest(new { success = false, message = "Selected degree does not belong to the selected college" });
            }

            if (model.Section is not ("A" or "B") || model.Semester < 1 || model.Semester > degree.DurationYears * 2)
            {
                return BadRequest(new { success = false, message = "Select a valid section and semester" });
            }

            // Resolve any pre-added record before applying the same college,
            // degree, mentor, and capacity checks used by self-registration.
            var existing = await _mongoService.Students.Find(s => s.Email == model.Email).FirstOrDefaultAsync();

            if (existing != null && (existing.CollegeId != model.CollegeId || !string.Equals(existing.RollNo, model.RollNo, StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest(new { success = false, message = "Pre-added student details do not match the selected college and roll number" });
            }

            var mentor = await _mongoService.Mentors.Find(m =>
                m.Id == model.MentorId &&
                m.Status == "approved" &&
                m.CollegeId == model.CollegeId &&
                m.AssignedCourseId == model.CourseId
            ).FirstOrDefaultAsync();
            if (mentor == null)
            {
                return BadRequest(new { success = false, message = "Selected approved mentor does not belong to the selected college and degree" });
            }

            var existingId = existing?.Id;
            var currentStudentsCount = await _mongoService.Students.CountDocumentsAsync(s => s.MentorId == model.MentorId && s.Id != existingId);
            if (currentStudentsCount >= mentor.MaxStudents)
            {
                return BadRequest(new { success = false, message = "The selected mentor has reached maximum student capacity. Please choose another mentor." });
            }
            
            var otp = new Random().Next(100000, 999999).ToString();

            if (existing != null)
            {
                if (existing.IsRegistered)
                {
                    return BadRequest(new { success = false, message = "Email or Roll Number already registered in this college" });
                }

                // Flow A (Pre-added by Mentor): Update existing record
                existing.Name = model.Name;
                existing.Password = BCrypt.Net.BCrypt.HashPassword(model.Password);
                existing.IsRegistered = true;
                existing.IsVerified = false; // OTP verification remains mandatory for pre-added students
                existing.VerificationStatus = "approved"; // Pre-added means pre-approved
                existing.Course = degree.Name;
                existing.CourseId = degree.Id;
                existing.Class = $"{degree.Name}-{model.Section}";
                existing.Semester = model.Semester;
                existing.MentorId = mentor.Id;
                existing.MentorName = mentor.Name;
                existing.Otp = otp;
                existing.OtpExpiry = DateTime.UtcNow.AddMinutes(15);

                await _mongoService.Students.ReplaceOneAsync(s => s.Id == existing.Id, existing);

                // Queue verification OTP email
                _emailQueueService.QueueEmail(existing.Email, $"Your verification code is: {otp}");

                return StatusCode(200, new
                {
                    success = true,
                    message = "Verification code sent to your email. Please verify to complete your signup."
                });
            }

            // Flow B (Self-Registered): Verify Roll number doesn't exist either
            var existingRoll = await _mongoService.Students.Find(s => s.CollegeId == model.CollegeId && s.RollNo == model.RollNo).FirstOrDefaultAsync();
            if (existingRoll != null)
            {
                return BadRequest(new { success = false, message = "Roll Number is already registered in this college" });
            }

            // Flow B (Self-Registered): Create new record
            var student = new Student
            {
                Name = model.Name,
                Email = model.Email,
                RollNo = model.RollNo,
                Password = BCrypt.Net.BCrypt.HashPassword(model.Password),
                CollegeId = model.CollegeId,
                CourseId = model.CourseId,
                Course = degree.Name,
                Class = $"{degree.Name}-{model.Section}",
                Semester = model.Semester,
                MentorId = model.MentorId,
                MentorName = mentor.Name,
                IsVerified = false, // Flow B starts unverified
                IsRegistered = true,
                VerificationStatus = "pending_mentor_approval", // Flow B requires mentor approval
                Otp = otp,
                OtpExpiry = DateTime.UtcNow.AddMinutes(15)
            };

            await _mongoService.Students.InsertOneAsync(student);

            // Queue verification OTP email
            _emailQueueService.QueueEmail(student.Email, $"Your verification code is: {otp}");

            return StatusCode(201, new
            {
                success = true,
                message = "Verification code sent to your email. Please verify to continue."
            });
        }


        [HttpPost("student/verify-otp")]
        public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequest model)
        {
            if (model == null || string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Otp))
            {
                return BadRequest(new { success = false, message = "Email and OTP are required" });
            }

            model.Email = model.Email.Trim().ToLower();

            var student = await _mongoService.Students.Find(s => s.Email == model.Email).FirstOrDefaultAsync();
            if (student == null)
            {
                return NotFound(new { success = false, message = "Student not found" });
            }

            if (student.Otp != model.Otp || student.OtpExpiry < DateTime.UtcNow)
            {
                return BadRequest(new { success = false, message = "Invalid or expired OTP code" });
            }

            // Clear OTP and set Verified to true
            student.IsVerified = true;
            student.Otp = null;
            student.OtpExpiry = null;
            student.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Students.ReplaceOneAsync(s => s.Id == student.Id, student);

            return Ok(new
            {
                success = true,
                message = "Email verified successfully! Your account is now pending assigned mentor verification."
            });
        }

        // --- LOGIN (SUPPORTING SECURE COOKIES) ---
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest model)
        {
            if (model == null || string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Password))
            {
                return BadRequest(new { success = false, message = "Please provide email and password" });
            }

            model.Email = model.Email.Trim().ToLower();

            // 1. Try resolving as Admin
            var admin = await _mongoService.Admins.Find(a => a.Email == model.Email).FirstOrDefaultAsync();
            if (admin != null && BCrypt.Net.BCrypt.Verify(model.Password, admin.Password))
            {
                if (admin.Status is not "active")
                    return Unauthorized(new { success = false, message = "Your account is inactive. Please contact your college administrator." });
                if (!string.IsNullOrEmpty(admin.CollegeId))
                {
                    var college = await _mongoService.Colleges.Find(c => c.Id == admin.CollegeId).FirstOrDefaultAsync();
                    if (college != null && college.IsBlocked)
                    {
                        return Unauthorized(new { success = false, message = "Your college has been blocked by the system administrator." });
                    }
                }

                var role = admin.Role; // could be "admin" or "college-admin"
                var token = GenerateJwtToken(admin.Id!, role);
                var rToken = GenerateRefreshToken();
                SetTokenCookies(token, rToken);

                return Ok(new
                {
                    success = true,
                    token,
                    data = new
                    {
                        id = admin.Id,
                        name = admin.Name,
                        email = admin.Email,
                        role = role,
                        collegeId = admin.CollegeId
                    }
                });
            }

            // 2. Try resolving as Mentor
            var mentor = await _mongoService.Mentors.Find(m => m.Email == model.Email).FirstOrDefaultAsync();
            if (mentor != null && BCrypt.Net.BCrypt.Verify(model.Password, mentor.Password))
            {
                if (!string.IsNullOrEmpty(mentor.CollegeId))
                {
                    var college = await _mongoService.Colleges.Find(c => c.Id == mentor.CollegeId).FirstOrDefaultAsync();
                    if (college != null && college.IsBlocked)
                    {
                        return Unauthorized(new { success = false, message = "Your college has been blocked by the system administrator." });
                    }
                }

                if (mentor.Status == "rejected" || mentor.Status == "disabled")
                {
                    return Unauthorized(new { success = false, message = "Your account is inactive. Please consult your administrator." });
                }

                var token = GenerateJwtToken(mentor.Id!, "mentor");
                var rToken = GenerateRefreshToken();
                SetTokenCookies(token, rToken);

                mentor.RefreshToken = rToken;
                mentor.RefreshTokenExpiry = DateTime.UtcNow.AddDays(30);
                await _mongoService.Mentors.ReplaceOneAsync(m => m.Id == mentor.Id, mentor);

                return Ok(new
                {
                    success = true,
                    token,
                    data = new
                    {
                        id = mentor.Id,
                        name = mentor.Name,
                        email = mentor.Email,
                        role = "mentor",
                        status = mentor.Status,
                        collegeId = mentor.CollegeId,
                        assignedClasses = mentor.AssignedClasses
                    }
                });
            }

            // 3. Try resolving as Student
            var student = await _mongoService.Students.Find(s => s.Email == model.Email).FirstOrDefaultAsync();
            if (student != null && !string.IsNullOrEmpty(student.Password) && BCrypt.Net.BCrypt.Verify(model.Password, student.Password))
            {
                if (!string.IsNullOrEmpty(student.CollegeId))
                {
                    var college = await _mongoService.Colleges.Find(c => c.Id == student.CollegeId).FirstOrDefaultAsync();
                    if (college != null && college.IsBlocked)
                    {
                        return Unauthorized(new { success = false, message = "Your college has been blocked by the system administrator." });
                    }
                }

                if (!student.IsVerified)
                {
                    return Unauthorized(new { success = false, message = "Email verification code is pending. Please verify your email." });
                }

                var token = GenerateJwtToken(student.Id!, "student");
                var rToken = GenerateRefreshToken();
                SetTokenCookies(token, rToken);

                student.RefreshToken = rToken;
                student.RefreshTokenExpiry = DateTime.UtcNow.AddDays(30);
                await _mongoService.Students.ReplaceOneAsync(s => s.Id == student.Id, student);

                return Ok(new
                {
                    success = true,
                    token,
                    data = new
                    {
                        id = student.Id,
                        name = student.Name,
                        email = student.Email,
                        role = "student",
                        rollNo = student.RollNo,
                        course = student.Course,
                        collegeId = student.CollegeId,
                        mentorId = student.MentorId,
                        verificationStatus = student.VerificationStatus
                    }
                });
            }

            return Unauthorized(new { success = false, message = "Invalid email or password" });
        }

        // --- SESSION REFRESH TOKEN ---
        [HttpPost("refresh-token")]
        public async Task<IActionResult> RefreshToken()
        {
            if (!Request.Cookies.TryGetValue("refresh_token", out var rToken) || string.IsNullOrEmpty(rToken))
            {
                return BadRequest(new { success = false, message = "Missing refresh token cookie" });
            }

            // 1. Resolve Mentor
            var mentor = await _mongoService.Mentors.Find(m => m.RefreshToken == rToken && m.RefreshTokenExpiry > DateTime.UtcNow).FirstOrDefaultAsync();
            if (mentor != null)
            {
                var newToken = GenerateJwtToken(mentor.Id!, "mentor");
                var newRToken = GenerateRefreshToken();
                SetTokenCookies(newToken, newRToken);

                mentor.RefreshToken = newRToken;
                mentor.RefreshTokenExpiry = DateTime.UtcNow.AddDays(30);
                await _mongoService.Mentors.ReplaceOneAsync(m => m.Id == mentor.Id, mentor);

                return Ok(new { success = true, token = newToken });
            }

            // 2. Resolve Student
            var student = await _mongoService.Students.Find(s => s.RefreshToken == rToken && s.RefreshTokenExpiry > DateTime.UtcNow).FirstOrDefaultAsync();
            if (student != null)
            {
                var newToken = GenerateJwtToken(student.Id!, "student");
                var newRToken = GenerateRefreshToken();
                SetTokenCookies(newToken, newRToken);

                student.RefreshToken = newRToken;
                student.RefreshTokenExpiry = DateTime.UtcNow.AddDays(30);
                await _mongoService.Students.ReplaceOneAsync(s => s.Id == student.Id, student);

                return Ok(new { success = true, token = newToken });
            }

            return Unauthorized(new { success = false, message = "Session expired. Please log in again." });
        }

        // --- LOGOUT (CLEAR COOKIES) ---
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            Response.Cookies.Delete("access_token");
            Response.Cookies.Delete("refresh_token");
            return Ok(new { success = true, message = "Signed out successfully" });
        }

        // --- ME ENDPOINT (REVIEWS SECURE COOKIE PRECEDENCE) ---
        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> GetMe()
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "Not authenticated" });
            }

            // 1. Resolve Admin
            var admin = await _mongoService.Admins.Find(a => a.Id == userId).FirstOrDefaultAsync();
            if (admin != null)
            {
                if (!string.IsNullOrEmpty(admin.CollegeId))
                {
                    var college = await _mongoService.Colleges.Find(c => c.Id == admin.CollegeId).FirstOrDefaultAsync();
                    if (college != null && college.IsBlocked)
                    {
                        return Unauthorized(new { success = false, message = "Your college has been blocked by the system administrator." });
                    }
                }

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        id = admin.Id,
                        name = admin.Name,
                        email = admin.Email,
                        role = admin.Role,
                        collegeId = admin.CollegeId,
                        collegeName = !string.IsNullOrEmpty(admin.CollegeId)
                            ? (await _mongoService.Colleges.Find(c => c.Id == admin.CollegeId).FirstOrDefaultAsync())?.Name ?? ""
                            : ""
                    }
                });
            }

            // 2. Resolve Mentor
            var mentor = await _mongoService.Mentors.Find(m => m.Id == userId).FirstOrDefaultAsync();
            if (mentor != null)
            {
                if (!string.IsNullOrEmpty(mentor.CollegeId))
                {
                    var college = await _mongoService.Colleges.Find(c => c.Id == mentor.CollegeId).FirstOrDefaultAsync();
                    if (college != null && college.IsBlocked)
                    {
                        return Unauthorized(new { success = false, message = "Your college has been blocked by the system administrator." });
                    }
                }

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        id = mentor.Id,
                        name = mentor.Name,
                        email = mentor.Email,
                        role = "mentor",
                        status = mentor.Status,
                        collegeId = mentor.CollegeId,
                        assignedClasses = mentor.AssignedClasses
                    }
                });
            }

            // 3. Resolve Student
            var student = await _mongoService.Students.Find(s => s.Id == userId).FirstOrDefaultAsync();
            if (student != null)
            {
                if (!string.IsNullOrEmpty(student.CollegeId))
                {
                    var college = await _mongoService.Colleges.Find(c => c.Id == student.CollegeId).FirstOrDefaultAsync();
                    if (college != null && college.IsBlocked)
                    {
                        return Unauthorized(new { success = false, message = "Your college has been blocked by the system administrator." });
                    }
                }

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        id = student.Id,
                        name = student.Name,
                        email = student.Email,
                        role = "student",
                        rollNo = student.RollNo,
                        course = student.Course,
                        collegeId = student.CollegeId,
                        mentorId = student.MentorId,
                        verificationStatus = student.VerificationStatus
                    }
                });
            }

            return Unauthorized(new { success = false, message = "User not found" });


        }

        [Authorize(Roles = "college-admin,librarian")]
        [HttpPost("lms-sso")]
        public async Task<IActionResult> CreateLmsSsoToken()
        {
            var userId = User.FindFirst("id")?.Value;
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(role)) return Unauthorized();

            string? collegeId = null, name = null, email = null;
            var admin = await _mongoService.Admins.Find(x => x.Id == userId && x.Role == role).FirstOrDefaultAsync();
            if (admin is null || admin.Status != "active") return Unauthorized();
            (collegeId, name, email) = (admin.CollegeId, admin.Name, admin.Email);

            if (string.IsNullOrEmpty(collegeId) || string.IsNullOrEmpty(name) || string.IsNullOrEmpty(email))
                return BadRequest(new { success = false, message = "A college-scoped EduGuard account is required for LMS access." });
            if (await _mongoService.Colleges.Find(x => x.Id == collegeId && x.IsBlocked).AnyAsync()) return Forbid();

            var lmsUrl = _configuration.GetValue<string>("LMS_FRONTEND_URL") ?? "https://edugard-ai-powerd-swsb.vercel.app";
            return Ok(new { success = true, token = GenerateLmsToken(userId, role, collegeId, name, email), lmsUrl = lmsUrl });
        }

    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class StudentSignupRequest
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string RollNo { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string CollegeId { get; set; } = string.Empty;
        public string CourseId { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public int Semester { get; set; }
        public string MentorId { get; set; } = string.Empty;
    }

    public class VerifyOtpRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Otp { get; set; } = string.Empty;
    }
}
