using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
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
        private readonly string _jwtSecret;

        public AuthController(MongoService mongoService, IConfiguration configuration)
        {
            _mongoService = mongoService;
            _jwtSecret = configuration.GetValue<string>("JWT_SECRET") ?? "eduguard_jwt_secret_dev_2026";
        }

        private string GenerateJwtToken(string userId)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = SHA256.HashData(Encoding.UTF8.GetBytes(_jwtSecret));
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[] { new Claim("id", userId) }),
                Expires = DateTime.UtcNow.AddDays(30),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] Mentor model)
        {
            if (model == null || string.IsNullOrEmpty(model.Name) || string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Password))
            {
                return BadRequest(new { success = false, message = "Please provide name, email and password" });
            }

            model.Email = model.Email.Trim().ToLower();

            // Check if mentor already exists
            var existing = await _mongoService.Mentors.Find(m => m.Email == model.Email).FirstOrDefaultAsync();
            if (existing != null)
            {
                return BadRequest(new { success = false, message = "Email is already registered" });
            }

            // Hash password
            model.Password = BCrypt.Net.BCrypt.HashPassword(model.Password);
            model.Role = string.IsNullOrEmpty(model.Role) ? "mentor" : model.Role;
            model.AssignedClasses ??= new();
            model.IsOnline = false;
            model.CreatedAt = DateTime.UtcNow;
            model.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Mentors.InsertOneAsync(model);

            var token = GenerateJwtToken(model.Id!);

            return StatusCode(201, new
            {
                success = true,
                token,
                data = new
                {
                    id = model.Id,
                    name = model.Name,
                    email = model.Email,
                    role = model.Role,
                    assignedClasses = model.AssignedClasses
                }
            });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest model)
        {
            if (model == null || string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Password))
            {
                return BadRequest(new { success = false, message = "Please provide email and password" });
            }

            model.Email = model.Email.Trim().ToLower();

            // 1. Try to login as Mentor
            var mentor = await _mongoService.Mentors.Find(m => m.Email == model.Email).FirstOrDefaultAsync();
            if (mentor != null && BCrypt.Net.BCrypt.Verify(model.Password, mentor.Password))
            {
                var token = GenerateJwtToken(mentor.Id!);
                return Ok(new
                {
                    success = true,
                    token,
                    data = new
                    {
                        id = mentor.Id,
                        name = mentor.Name,
                        email = mentor.Email,
                        role = mentor.Role,
                        assignedClasses = mentor.AssignedClasses
                    }
                });
            }

            // 2. Try to login as Student (strictly by email)
            var student = await _mongoService.Students.Find(s => s.Email == model.Email).FirstOrDefaultAsync();
            if (student != null)
            {
                if (!student.IsVerified)
                {
                    return Unauthorized(new { success = false, message = "Account is not verified. Please check your email to activate." });
                }

                if (!string.IsNullOrEmpty(student.Password) && BCrypt.Net.BCrypt.Verify(model.Password, student.Password))
                {
                    var token = GenerateJwtToken(student.Id!);
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
                            @class = student.Class,
                            mentorId = student.MentorId
                        }
                    });
                }
            }

            return Unauthorized(new { success = false, message = "Invalid email or password" });
        }

        [HttpPost("verify-set-password")]
        public async Task<IActionResult> VerifySetPassword([FromBody] VerifyPasswordRequest model)
        {
            if (model == null || string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Token) || string.IsNullOrEmpty(model.Password))
            {
                return BadRequest(new { success = false, message = "Please provide email, token, and password" });
            }

            model.Email = model.Email.Trim().ToLower();

            var student = await _mongoService.Students
                .Find(s => s.Email == model.Email && s.VerificationToken == model.Token)
                .FirstOrDefaultAsync();

            if (student == null)
            {
                return BadRequest(new { success = false, message = "Invalid email or verification token" });
            }

            // Set password, verify, and clear token
            student.Password = BCrypt.Net.BCrypt.HashPassword(model.Password);
            student.IsVerified = true;
            student.VerificationToken = null;
            student.UpdatedAt = DateTime.UtcNow;

            await _mongoService.Students.ReplaceOneAsync(s => s.Id == student.Id, student);

            return Ok(new
            {
                success = true,
                message = "Account verified and password set successfully. You can now log in."
            });
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> GetMe()
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "You are not logged in" });
            }

            // 1. Try resolving as Mentor
            var mentor = await _mongoService.Mentors.Find(m => m.Id == userId).FirstOrDefaultAsync();
            if (mentor != null)
            {
                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        id = mentor.Id,
                        name = mentor.Name,
                        email = mentor.Email,
                        role = mentor.Role,
                        assignedClasses = mentor.AssignedClasses
                    }
                });
            }

            // 2. Try resolving as Student
            var student = await _mongoService.Students.Find(s => s.Id == userId).FirstOrDefaultAsync();
            if (student != null)
            {
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
                        @class = student.Class,
                        mentorId = student.MentorId
                    }
                });
            }

            return Unauthorized(new { success = false, message = "User not found" });
        }
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class VerifyPasswordRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
