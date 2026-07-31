using System.Security.Claims;
using EduGuard.Models;
using EduGuard.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace EduGuard.Controllers;

[ApiController, Authorize(Roles = "college-admin"), Route("api/librarians")]
public sealed class LibrariansController : ControllerBase
{
    private readonly MongoService _mongo;
    public LibrariansController(MongoService mongo) => _mongo = mongo;

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken token)
    {
        var admin = await CurrentAdmin(token); if (admin == null) return Unauthorized();
        var data = await _mongo.Admins.Find(x => x.CollegeId == admin.CollegeId && x.Role == "librarian" && x.Status != "deleted")
            .Project(x => new { x.Id, x.Name, x.Email, x.Status, x.CreatedAt }).ToListAsync(token);
        return Ok(new { success = true, data });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] LibrarianAccountRequest request, CancellationToken token)
    {
        var admin = await CurrentAdmin(token); if (admin == null) return Unauthorized();
        var error = await Validate(request, null, token); if (error != null) return BadRequest(new { success = false, message = error });
        var librarian = new Admin { CollegeId = admin.CollegeId, Name = request.Name.Trim(), Email = request.Email.Trim().ToLowerInvariant(), Password = BCrypt.Net.BCrypt.HashPassword(request.Password), Role = "librarian", Status = "active" };
        await _mongo.Admins.InsertOneAsync(librarian, cancellationToken: token);
        return StatusCode(201, new { success = true, data = new { librarian.Id, librarian.Name, librarian.Email, librarian.Status } });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] LibrarianAccountRequest request, CancellationToken token)
    {
        var admin = await CurrentAdmin(token); if (admin == null) return Unauthorized();
        var librarian = await _mongo.Admins.Find(x => x.Id == id && x.CollegeId == admin.CollegeId && x.Role == "librarian" && x.Status != "deleted").FirstOrDefaultAsync(token);
        if (librarian == null) return NotFound();
        var error = await Validate(request, id, token); if (error != null) return BadRequest(new { success = false, message = error });
        librarian.Name = request.Name.Trim(); librarian.Email = request.Email.Trim().ToLowerInvariant(); librarian.Status = request.Status is "active" or "disabled" ? request.Status : librarian.Status; librarian.UpdatedAt = DateTime.UtcNow;
        if (!string.IsNullOrEmpty(request.Password)) librarian.Password = BCrypt.Net.BCrypt.HashPassword(request.Password);
        await _mongo.Admins.ReplaceOneAsync(x => x.Id == id, librarian, cancellationToken: token);
        return Ok(new { success = true });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken token)
    {
        var admin = await CurrentAdmin(token); if (admin == null) return Unauthorized();
        var result = await _mongo.Admins.UpdateOneAsync(x => x.Id == id && x.CollegeId == admin.CollegeId && x.Role == "librarian",
            Builders<Admin>.Update.Set(x => x.Status, "deleted").Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);
        return result.ModifiedCount == 0 ? NotFound() : Ok(new { success = true });
    }

    private async Task<string?> Validate(LibrarianAccountRequest request, string? currentId, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email)) return "Name and email are required.";
        if ((currentId == null || !string.IsNullOrEmpty(request.Password)) && !LibrarianPasswordPolicy.IsStrong(request.Password)) return LibrarianPasswordPolicy.Message;
        var email = request.Email.Trim().ToLowerInvariant();
        if (await _mongo.Admins.Find(x => x.Email == email && x.Id != currentId).AnyAsync(token) || await _mongo.Mentors.Find(x => x.Email == email).AnyAsync(token) || await _mongo.Students.Find(x => x.Email == email).AnyAsync(token)) return "Email is already registered.";
        return null;
    }

    private Task<Admin?> CurrentAdmin(CancellationToken token)
    {
        var id = User.FindFirst("id")?.Value;
        return _mongo.Admins.Find(x => x.Id == id && x.Role == "college-admin" && x.Status == "active").FirstOrDefaultAsync(token)!;
    }
}

public sealed record LibrarianAccountRequest(string Name, string Email, string Password = "", string Status = "active");
