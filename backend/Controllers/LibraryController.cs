using System.Security.Claims;
using EduGuard.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace EduGuard.Controllers;

[ApiController, Authorize, Route("api/library")]
public sealed class LibraryController : ControllerBase
{
    private readonly ILibraryService _library;
    private readonly MongoService _mongo;
    public LibraryController(ILibraryService library, MongoService mongo) => (_library, _mongo) = (library, mongo);

    [HttpGet("students/{studentId}/books")]
    public async Task<IActionResult> GetIssuedBooks(string studentId, CancellationToken token)
    {
        if (!await CanViewAsync(studentId, token)) return Forbid();
        try
        {
            var books = await _library.GetIssuedBooksAsync(studentId, token);
            var now = DateTime.UtcNow;
            return Ok(new { success = true, data = books.Select(x => new { x.BookId, x.Title, x.IssueDate, x.DueDate, status = x.DueDate.Date < now.Date ? "overdue" : "on-time" }) });
        }
        catch (KeyNotFoundException) { return NotFound(new { success = false, message = "Student not found" }); }
    }

    private async Task<bool> CanViewAsync(string studentId, CancellationToken token)
    {
        var userId = User.FindFirst("id")?.Value;
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(userId)) return false;
        if (role == "student") return userId == studentId;
        if (role == "admin") return true;

        var student = await _mongo.Students.Find(x => x.Id == studentId).FirstOrDefaultAsync(token);
        if (student == null) return false;
        if (role == "mentor") return student.MentorId == userId;
        if (role != "college-admin") return false;
        var admin = await _mongo.Admins.Find(x => x.Id == userId).FirstOrDefaultAsync(token);
        return !string.IsNullOrEmpty(admin?.CollegeId) && admin.CollegeId == student.CollegeId;
    }
}
