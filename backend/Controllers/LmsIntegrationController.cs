using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.IdentityModel.Tokens.Jwt;
using EduGuard.Models;
using EduGuard.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;

namespace EduGuard.Controllers;

[ApiController, Route("api/integrations/lms")]
public sealed class LmsIntegrationController : ControllerBase
{
    private readonly MongoService _mongo;
    private readonly IPushNotificationQueue _push;
    private readonly string _serviceKey;
    private readonly IConfiguration _configuration;

    public LmsIntegrationController(MongoService mongo, IPushNotificationQueue push, IConfiguration config) =>
        (_mongo, _push, _serviceKey, _configuration) = (mongo, push, config["LMS_SERVICE_KEY"] ?? string.Empty, config);

    [HttpPost("sso/validate")]
    public IActionResult ValidateSso([FromBody] ValidateLmsSsoRequest request)
    {
        if (!Authorized()) return Unauthorized();
        var key = SHA256.HashData(Encoding.UTF8.GetBytes(_configuration["JWT_SECRET"] ?? throw new InvalidOperationException("JWT_SECRET is required.")));
        var principal = new JwtSecurityTokenHandler().ValidateToken(request.Token, new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(key), ValidateIssuer = true, ValidIssuer = "eduguard",
            ValidateAudience = true, ValidAudience = "eduguard-lms", ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30), RoleClaimType = ClaimTypes.Role
        }, out _);
        return Ok(new { id = principal.FindFirst("id")?.Value, role = principal.FindFirst(ClaimTypes.Role)?.Value, collegeId = principal.FindFirst("collegeId")?.Value, name = principal.FindFirst("name")?.Value, email = principal.FindFirst("email")?.Value });
    }

    [HttpGet("identities/{id}")]
    public async Task<IActionResult> Identity(string id, CancellationToken token)
    {
        if (!Authorized()) return Unauthorized();
        var admin = await _mongo.Admins.Find(x => x.Id == id).FirstOrDefaultAsync(token);
        if (admin != null) return Ok(new { id = admin.Id, admin.Name, admin.Email, admin.Role, admin.CollegeId, admin.Status });
        var mentor = await _mongo.Mentors.Find(x => x.Id == id).FirstOrDefaultAsync(token);
        if (mentor != null) return Ok(new { id = mentor.Id, mentor.Name, mentor.Email, role = "mentor", mentor.CollegeId, status = mentor.Status, degreeId = mentor.AssignedCourseId, classes = mentor.AssignedClasses });
        var student = await _mongo.Students.Find(x => x.Id == id).FirstOrDefaultAsync(token);
        if (student != null) return Ok(new { id = student.Id, student.Name, student.Email, role = "student", student.CollegeId, status = student.VerificationStatus, degreeId = student.CourseId, className = student.Class, student.RollNo });
        return NotFound();
    }

    [HttpGet("colleges/{collegeId}/librarians")]
    public async Task<IActionResult> Librarians(string collegeId, [FromQuery] string actorId, CancellationToken token)
    {
        if (!Authorized() || !await IsCollegeAdminAsync(actorId, collegeId, token)) return Unauthorized();
        var list = await _mongo.Admins.Find(x => x.CollegeId == collegeId && x.Role == "librarian" && x.Status != "deleted")
            .Project(x => new { x.Id, x.Name, x.Email, x.Role, x.Status, x.CreatedAt }).ToListAsync(token);
        return Ok(new { success = true, data = list });
    }

    [HttpPost("librarians/authenticate")]
    public async Task<IActionResult> AuthenticateLibrarian([FromBody] LibrarianLoginRequest request, CancellationToken token)
    {
        if (!Authorized()) return Unauthorized();
        var email = request.Email.Trim().ToLowerInvariant();
        var librarian = await _mongo.Admins.Find(x => x.Email == email && x.Role == "librarian" && x.Status == "active").FirstOrDefaultAsync(token);
        if (librarian == null || !BCrypt.Net.BCrypt.Verify(request.Password, librarian.Password)) return Unauthorized(new { success = false, message = "Invalid librarian email or password." });
        return Ok(new { id = librarian.Id, librarian.Name, librarian.Email, librarian.Role, librarian.CollegeId });
    }

    [HttpGet("colleges/{collegeId}/librarians/internal")]
    public async Task<IActionResult> InternalLibrarians(string collegeId, CancellationToken token)
    {
        if (!Authorized()) return Unauthorized();
        var data = await _mongo.Admins.Find(x => x.CollegeId == collegeId && x.Role == "librarian" && x.Status == "active")
            .Project(x => new { x.Id, x.Name, x.Email }).ToListAsync(token);
        return Ok(new { success = true, data });
    }

    [HttpPost("colleges/{collegeId}/librarians")]
    public async Task<IActionResult> CreateLibrarian(string collegeId, [FromBody] CreateLibrarianRequest request, CancellationToken token)
    {
        if (!Authorized() || !await IsCollegeAdminAsync(request.ActorId, collegeId, token)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email)) return BadRequest(new { success = false, message = "Name and email are required." });
        if (!LibrarianPasswordPolicy.IsStrong(request.Password)) return BadRequest(new { success = false, message = LibrarianPasswordPolicy.Message });
        var email = request.Email.Trim().ToLowerInvariant();
        if (await _mongo.Admins.Find(x => x.Email == email).AnyAsync(token) || await _mongo.Mentors.Find(x => x.Email == email).AnyAsync(token) || await _mongo.Students.Find(x => x.Email == email).AnyAsync(token))
            return Conflict(new { success = false, message = "Email is already registered." });
        var librarian = new Admin { CollegeId = collegeId, Name = request.Name.Trim(), Email = email, Password = BCrypt.Net.BCrypt.HashPassword(request.Password), Role = "librarian", Status = "active" };
        await _mongo.Admins.InsertOneAsync(librarian, cancellationToken: token);
        return StatusCode(201, new { success = true, data = new { librarian.Id, librarian.Name, librarian.Email, librarian.Role, librarian.Status } });
    }

    [HttpPatch("librarians/{id}")]
    public async Task<IActionResult> UpdateLibrarian(string id, [FromBody] UpdateLibrarianRequest request, CancellationToken token)
    {
        if (!Authorized() || request.Status is not ("active" or "disabled")) return BadRequest();
        var librarian = await _mongo.Admins.Find(x => x.Id == id && x.Role == "librarian" && x.Status != "deleted").FirstOrDefaultAsync(token);
        if (librarian == null) return NotFound();
        if (!await IsCollegeAdminAsync(request.ActorId, librarian.CollegeId!, token)) return Unauthorized();
        var update = Builders<Admin>.Update.Set(x => x.Status, request.Status).Set(x => x.UpdatedAt, DateTime.UtcNow);
        if (!string.IsNullOrWhiteSpace(request.Name)) update = update.Set(x => x.Name, request.Name.Trim());
        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var email = request.Email.Trim().ToLowerInvariant();
            if (await _mongo.Admins.Find(x => x.Email == email && x.Id != id).AnyAsync(token) || await _mongo.Mentors.Find(x => x.Email == email).AnyAsync(token) || await _mongo.Students.Find(x => x.Email == email).AnyAsync(token)) return Conflict(new { success = false, message = "Email is already registered." });
            update = update.Set(x => x.Email, email);
        }
        if (!string.IsNullOrEmpty(request.Password))
        {
            if (!LibrarianPasswordPolicy.IsStrong(request.Password)) return BadRequest(new { success = false, message = LibrarianPasswordPolicy.Message });
            update = update.Set(x => x.Password, BCrypt.Net.BCrypt.HashPassword(request.Password));
        }
        await _mongo.Admins.UpdateOneAsync(x => x.Id == id, update, cancellationToken: token);
        return Ok(new { success = true });
    }

    [HttpDelete("librarians/{id}")]
    public async Task<IActionResult> DeleteLibrarian(string id, [FromQuery] string actorId, CancellationToken token)
    {
        if (!Authorized()) return Unauthorized();
        var librarian = await _mongo.Admins.Find(x => x.Id == id && x.Role == "librarian").FirstOrDefaultAsync(token);
        if (librarian == null) return NotFound();
        if (!await IsCollegeAdminAsync(actorId, librarian.CollegeId!, token)) return Unauthorized();
        await _mongo.Admins.UpdateOneAsync(x => x.Id == id, Builders<Admin>.Update.Set(x => x.Status, "deleted").Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);
        return Ok(new { success = true });
    }

    [HttpPost("push")]
    public async Task<IActionResult> Push([FromBody] LmsPushRequest request, CancellationToken token)
    {
        if (!Authorized()) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.UserId) || string.IsNullOrWhiteSpace(request.IdempotencyKey)) return BadRequest();
        await _push.EnqueueAsync(request.UserId, $"lms:{request.IdempotencyKey}", new PushMessage(request.Title, request.Body,
            request.Priority == "important" ? "important" : "normal", request.Data ?? new Dictionary<string, string>()), token);
        return Accepted(new { success = true });
    }

    private bool Authorized()
    {
        var supplied = Request.Headers["X-LMS-Service-Key"].FirstOrDefault() ?? string.Empty;
        if (string.IsNullOrEmpty(_serviceKey) || supplied.Length != _serviceKey.Length) return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(_serviceKey));
    }

    private async Task<bool> IsCollegeAdminAsync(string actorId, string collegeId, CancellationToken token) =>
        await _mongo.Admins.Find(x => x.Id == actorId && x.CollegeId == collegeId && x.Role == "college-admin" && x.Status == "active").AnyAsync(token);
}

public sealed record CreateLibrarianRequest(string ActorId, string Name, string Email, string Password);
public sealed record UpdateLibrarianRequest(string ActorId, string Status, string? Name = null, string? Email = null, string? Password = null);
public sealed record LibrarianLoginRequest(string Email, string Password);
public sealed record LmsPushRequest(string UserId, string IdempotencyKey, string Title, string Body, string Priority, Dictionary<string, string>? Data);
public sealed record ValidateLmsSsoRequest(string Token);
