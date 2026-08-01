using EduGuard.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EduGuard.Controllers;

[ApiController, Authorize(Roles = "student"), Route("api/library")]
public sealed class LibraryController : ControllerBase
{
    private readonly ILibraryService _library;
    public LibraryController(ILibraryService library) => _library = library;

    [HttpGet("students/{studentId}/books")]
    public async Task<IActionResult> GetIssuedBooks(string studentId, CancellationToken token)
    {
        if (User.FindFirst("id")?.Value != studentId) return Forbid();
        try
        {
            var books = await _library.GetIssuedBooksAsync(studentId, token);
            var now = DateTime.UtcNow;
            return Ok(new { success = true, data = books.Select(x => new { x.BookId, x.Title, x.IssueDate, x.DueDate, status = x.DueDate.Date < now.Date ? "overdue" : "on-time" }) });
        }
        catch (KeyNotFoundException) { return NotFound(new { success = false, message = "Student not found" }); }
        catch (HttpRequestException) { return StatusCode(503, new { success = false, message = "Library service is temporarily unavailable" }); }
    }

}
