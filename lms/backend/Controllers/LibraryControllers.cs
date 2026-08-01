using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Lms.Api.Data;
using Lms.Api.Models;
using Lms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;

namespace Lms.Api.Controllers;

[ApiController, Authorize, Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IEduGuardClient _eduguard;
    public AuthController(IConfiguration config, IEduGuardClient eduguard) => (_config, _eduguard) = (config, eduguard);

    [AllowAnonymous, HttpPost("exchange")]
    public async Task<IActionResult> Exchange([FromBody] ExchangeRequest request, CancellationToken cancellationToken)
    {
        var actor = await _eduguard.ValidateSsoAsync(request.Token, cancellationToken);
        if (actor.Role is not ("college-admin" or "librarian")) return Forbid();
        return Ok(new { success = true, token = CreateToken(actor) });
    }

    [AllowAnonymous, HttpPost("librarian-login")]
    public async Task<IActionResult> LibrarianLogin([FromBody] LibrarianLoginRequest request, CancellationToken cancellationToken)
    {
        var actor = await _eduguard.LibrarianLoginAsync(request.Email, request.Password, cancellationToken);
        if (actor.Role != "librarian") return Forbid();
        return Ok(new { success = true, token = CreateToken(actor) });
    }

    private string CreateToken(LmsActor actor)
    {
        var lmsKey = SHA256.HashData(Encoding.UTF8.GetBytes(_config["LMS_JWT_SECRET"] ?? throw new InvalidOperationException("LMS_JWT_SECRET is required.")));
        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[] { new Claim("id", actor.Id), new Claim(ClaimTypes.Role, actor.Role), new Claim("collegeId", actor.CollegeId), new Claim("name", actor.Name), new Claim("email", actor.Email) }),
            Issuer = "eduguard-lms", Audience = "eduguard-lms-api", Expires = DateTime.UtcNow.AddHours(8),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(lmsKey), SecurityAlgorithms.HmacSha256Signature)
        };
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityTokenHandler().CreateToken(descriptor));
    }

    [HttpGet("me"), Authorize(Roles = "librarian,college-admin")]
    public IActionResult Me() => Ok(new { success = true, data = Actor(User) });
    internal static LmsActor Actor(ClaimsPrincipal user) => new(user.FindFirst("id")?.Value ?? "", user.FindFirst(ClaimTypes.Role)?.Value ?? "", user.FindFirst("collegeId")?.Value ?? "", user.FindFirst("name")?.Value ?? "", user.FindFirst("email")?.Value ?? "");
}

[ApiController, Authorize, Route("api/catalog"), EnableRateLimiting("catalog")]
public sealed class CatalogController : ControllerBase
{
    private readonly ICatalogService _catalog;
    public CatalogController(ICatalogService catalog) => _catalog = catalog;

    [HttpGet, Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> Search([FromQuery] string? search, [FromQuery] string? category, [FromQuery] bool? available, [FromQuery] int page = 1, [FromQuery] int limit = 24, CancellationToken token = default)
    { var actor = AuthController.Actor(User); return Ok(new { success = true, data = await _catalog.SearchAsync(actor.CollegeId, new(search, category, available, page, limit), token) }); }

    [HttpPost, Authorize(Roles = "librarian")]
    public async Task<IActionResult> Add([FromBody] Book book, CancellationToken token)
    { book.Id = null; return StatusCode(201, new { success = true, data = await _catalog.SaveAsync(AuthController.Actor(User), book, token) }); }

    [HttpPut("{id}"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Edit(string id, [FromBody] Book book, CancellationToken token)
    { book.Id = id; return Ok(new { success = true, data = await _catalog.SaveAsync(AuthController.Actor(User), book, token) }); }

    [HttpPost("import"), Authorize(Roles = "librarian"), RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken token)
    {
        if (file.Length == 0 || !Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase) && !Path.GetExtension(file.FileName).Equals(".xls", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "An .xlsx or .xls catalog file is required." });
        await using var stream = file.OpenReadStream(); var saved = await _catalog.ImportAsync(AuthController.Actor(User), stream, token);
        return Ok(new { success = true, imported = saved.Count, data = saved });
    }
}

[ApiController, Authorize, Route("api/circulation")]
public sealed class CirculationController : ControllerBase
{
    private readonly ILibraryCirculationService _service; private readonly ICirculationRepository _repo;
    public CirculationController(ILibraryCirculationService service, ICirculationRepository repo) => (_service, _repo) = (service, repo);
    private string Key => Request.Headers["Idempotency-Key"].FirstOrDefault() ?? "";

    [HttpGet("issuances"), Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> Issuances([FromQuery] string? status, [FromQuery] string? studentId, CancellationToken token)
    {
        var actor = AuthController.Actor(User);
        var data = studentId != null ? await _service.IssuedAsync(actor, studentId, false, token) : await _repo.ListIssuancesAsync(actor.CollegeId, status, null, token);
        return Ok(new { success = true, data });
    }

    [HttpGet("overdue"), Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> Overdue(CancellationToken token)
    { var actor = AuthController.Actor(User); var data = (await _repo.ListIssuancesAsync(actor.CollegeId, "active", null, token)).Where(x => x.DueDate.Date < DateTime.UtcNow.Date); return Ok(new { success = true, data }); }

    [HttpPost("issue"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Issue([FromBody] IssueRequest request, CancellationToken token) => Ok(new { success = true, data = await _service.IssueAsync(AuthController.Actor(User), request.StudentId, request.BookId, Key, token) });
    [HttpPost("{id}/return"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Return(string id, CancellationToken token) => Ok(new { success = true, data = await _service.ReturnAsync(AuthController.Actor(User), id, Key, token) });
    [HttpPost("{id}/renew"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Renew(string id, CancellationToken token) => Ok(new { success = true, data = await _service.RenewAsync(AuthController.Actor(User), id, Key, token) });

    [HttpPost("reservations"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Reserve([FromBody] ReserveRequest request, CancellationToken token)
    { var actor = AuthController.Actor(User); return Ok(new { success = true, data = await _service.ReserveAsync(actor, request.StudentId, request.BookId, Key, token) }); }
    [HttpGet("reservations"), Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> Reservations([FromQuery] string? status, CancellationToken token)
    { var actor = AuthController.Actor(User); return Ok(new { success = true, data = await _repo.ReservationsAsync(actor.CollegeId, null, null, status, token) }); }
    [HttpDelete("reservations/{id}"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Cancel(string id, CancellationToken token)
    { var actor = AuthController.Actor(User); await _repo.CancelReservationAsync(actor.CollegeId, id, token); return Ok(new { success = true }); }
}

[ApiController, Authorize, Route("api/students")]
public sealed class LibraryStudentsController : ControllerBase
{
    private readonly LmsMongoContext _db; private readonly IEduGuardClient _eduguard; private readonly ICirculationRepository _circulation;
    public LibraryStudentsController(LmsMongoContext db, IEduGuardClient eduguard, ICirculationRepository circulation) => (_db, _eduguard, _circulation) = (db, eduguard, circulation);

    [HttpGet, Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> List(CancellationToken token)
    {
        var actor = AuthController.Actor(User);
        return Ok(new { success = true, data = await _db.Students.Find(x => x.CollegeId == actor.CollegeId).SortBy(x => x.Name).ToListAsync(token) });
    }

    [HttpGet("search-eduguard"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> SearchEduGuard([FromQuery] string search, CancellationToken token)
    {
        var actor = AuthController.Actor(User);
        if (string.IsNullOrWhiteSpace(search) || search.Trim().Length < 2) return BadRequest(new { success = false, message = "Enter at least 2 characters." });
        var data = await _eduguard.SearchStudentsAsync(actor.CollegeId, search.Trim(), token);
        var ids = data.Select(x => x.Id).ToList();
        var registered = await _db.Students.Find(Builders<LibraryStudent>.Filter.Eq(x => x.CollegeId, actor.CollegeId) & Builders<LibraryStudent>.Filter.In(x => x.EduGuardStudentId, ids)).Project(x => x.EduGuardStudentId).ToListAsync(token);
        return Ok(new { success = true, data = data.Select(x => new { x.Id, x.Name, x.Email, x.RollNo, x.PhoneNo, x.DegreeId, x.Course, x.ClassName, x.Semester, registered = registered.Contains(x.Id) }) });
    }

    [HttpPost("{studentId}"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Register(string studentId, CancellationToken token)
    {
        var actor = AuthController.Actor(User); var source = await _eduguard.IdentityAsync(studentId, token);
        if (source.Role != "student" || source.Status != "approved" || source.CollegeId != actor.CollegeId) return Forbid();
        var update = Builders<LibraryStudent>.Update
            .Set(x => x.Name, source.Name).Set(x => x.RollNo, source.RollNo ?? "").Set(x => x.Email, source.Email).Set(x => x.PhoneNo, source.PhoneNo)
            .Set(x => x.CourseId, source.DegreeId).Set(x => x.Course, source.Course ?? "").Set(x => x.ClassName, source.ClassName ?? "").Set(x => x.Semester, source.Semester).Set(x => x.UpdatedAt, DateTime.UtcNow)
            .SetOnInsert(x => x.CollegeId, actor.CollegeId).SetOnInsert(x => x.EduGuardStudentId, source.Id).SetOnInsert(x => x.RegisteredBy, actor.Id).SetOnInsert(x => x.RegisteredAt, DateTime.UtcNow);
        var student = await _db.Students.FindOneAndUpdateAsync(x => x.CollegeId == actor.CollegeId && x.EduGuardStudentId == source.Id, update, new FindOneAndUpdateOptions<LibraryStudent> { IsUpsert = true, ReturnDocument = ReturnDocument.After }, token);
        await _circulation.AddAuditAsync(new() { CollegeId = actor.CollegeId, ActorId = actor.Id, Action = "student.register", EntityType = "student", EntityId = source.Id }, token);
        return Ok(new { success = true, data = student });
    }

    [HttpGet("{studentId}/history"), Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> History(string studentId, CancellationToken token)
    {
        var actor = AuthController.Actor(User);
        if (!await _db.Students.Find(x => x.CollegeId == actor.CollegeId && x.EduGuardStudentId == studentId).AnyAsync(token)) return NotFound();
        var issuances = await _circulation.ListIssuancesAsync(actor.CollegeId, null, studentId, token);
        var reservations = await _circulation.ReservationsAsync(actor.CollegeId, studentId, null, null, token);
        var fines = await _circulation.FinesAsync(actor.CollegeId, studentId, token);
        return Ok(new { success = true, data = new { issuances, reservations, fines } });
    }
}

[ApiController, Authorize, Route("api/library-admin")]
public sealed class LibraryAdminController : ControllerBase
{
    private readonly ICirculationRepository _repo; private readonly LmsMongoContext _db; private readonly IEduGuardClient _eduguard;
    public LibraryAdminController(ICirculationRepository repo, LmsMongoContext db, IEduGuardClient eduguard) => (_repo, _db, _eduguard) = (repo, db, eduguard);

    [HttpGet("fines"), Authorize(Roles = "librarian,college-admin")]
    public async Task<IActionResult> Fines([FromQuery] string? studentId, CancellationToken token)
    { var actor = AuthController.Actor(User); return Ok(new { success = true, data = await _repo.FinesAsync(actor.CollegeId, studentId, token) }); }
    [HttpPost("fines/{id}/payment"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Payment(string id, [FromBody] FineActionRequest request, CancellationToken token)
    { if (request.Amount <= 0) return BadRequest(); var actor = AuthController.Actor(User); var fine = await _repo.UpdateFineAsync(actor.CollegeId, id, request.Amount, 0, token); await AuditFine(actor, fine, "fine.payment", request, token); return Ok(new { success = true, data = fine }); }
    [HttpPost("fines/{id}/waive"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Waive(string id, [FromBody] FineActionRequest request, CancellationToken token)
    { if (request.Amount <= 0 || string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { message = "Positive amount and reason are required." }); var actor = AuthController.Actor(User); var fine = await _repo.UpdateFineAsync(actor.CollegeId, id, 0, request.Amount, token); await AuditFine(actor, fine, "fine.waive", request, token); return Ok(new { success = true, data = fine }); }

    [HttpGet("reports"), Authorize(Roles = "college-admin")]
    public async Task<IActionResult> Reports(CancellationToken token)
    {
        var actor = AuthController.Actor(User);
        var mostBorrowed = await _db.Books.Find(x => x.CollegeId == actor.CollegeId).SortByDescending(x => x.BorrowCount).Limit(10).Project(x => new { x.Id, x.Title, x.Author, x.BorrowCount }).ToListAsync(token);
        var issuances = await _repo.ListIssuancesAsync(actor.CollegeId, null, null, token); var today = DateTime.UtcNow.Date;
        var byClass = issuances.GroupBy(x => string.IsNullOrEmpty(x.ClassName) ? "Unassigned" : x.ClassName).Select(x => new { className = x.Key, total = x.Count(), active = x.Count(i => i.Status == "active"), overdue = x.Count(i => i.Status == "active" && i.DueDate.Date < today) }).OrderByDescending(x => x.total);
        return Ok(new { success = true, data = new { mostBorrowed, totals = new { issuances = issuances.Count, active = issuances.Count(x => x.Status == "active"), overdue = issuances.Count(x => x.Status == "active" && x.DueDate.Date < today) }, byClass } });
    }

    [HttpGet("librarians"), Authorize(Roles = "college-admin")]
    public async Task<IActionResult> Librarians(CancellationToken token) { var actor = AuthController.Actor(User); return Content((await _eduguard.LibrariansAsync(actor.CollegeId, actor.Id, token)).GetRawText(), "application/json"); }
    [HttpPost("librarians"), Authorize(Roles = "college-admin")]
    public async Task<IActionResult> CreateLibrarian([FromBody] LibrarianRequest request, CancellationToken token) { var actor = AuthController.Actor(User); return Content((await _eduguard.CreateLibrarianAsync(actor.CollegeId, actor.Id, request.Name, request.Email, request.Password, token)).GetRawText(), "application/json"); }
    [HttpPatch("librarians/{id}"), Authorize(Roles = "college-admin")]
    public async Task<IActionResult> UpdateLibrarian(string id, [FromBody] LibrarianStatusRequest request, CancellationToken token) { var actor = AuthController.Actor(User); await _eduguard.UpdateLibrarianAsync(id, actor.Id, request.Status, request.Name, request.Email, request.Password, token); return Ok(new { success = true }); }
    [HttpDelete("librarians/{id}"), Authorize(Roles = "college-admin")]
    public async Task<IActionResult> DeleteLibrarian(string id, CancellationToken token) { var actor = AuthController.Actor(User); await _eduguard.DeleteLibrarianAsync(id, actor.Id, token); return Ok(new { success = true }); }

    [HttpGet("preferences"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Preferences(CancellationToken token) { var actor = AuthController.Actor(User); var prefs = await _db.Preferences.Find(x => x.LibrarianId == actor.Id).FirstOrDefaultAsync(token) ?? new LibrarianPreferences { LibrarianId = actor.Id, CollegeId = actor.CollegeId }; return Ok(new { success = true, data = prefs }); }
    [HttpPut("preferences"), Authorize(Roles = "librarian")]
    public async Task<IActionResult> Preferences([FromBody] LibrarianPreferences prefs, CancellationToken token) { var actor = AuthController.Actor(User); prefs.Id = null; prefs.LibrarianId = actor.Id; prefs.CollegeId = actor.CollegeId; prefs.UpdatedAt = DateTime.UtcNow; await _db.Preferences.ReplaceOneAsync(x => x.LibrarianId == actor.Id, prefs, new ReplaceOptions { IsUpsert = true }, token); return Ok(new { success = true, data = prefs }); }

    private Task AuditFine(LmsActor actor, Fine fine, string action, FineActionRequest request, CancellationToken token) => _repo.AddAuditAsync(new() { CollegeId = actor.CollegeId, ActorId = actor.Id, Action = action, EntityType = "fine", EntityId = fine.Id!, Details = new() { ["amount"] = request.Amount.ToString("0.00"), ["reason"] = request.Reason ?? "" } }, token);
}

[ApiController, Route("api/internal/eduguard")]
public sealed class EduGuardCompatibilityController : ControllerBase
{
    private readonly ILibraryCirculationService _service; private readonly ICirculationRepository _repo; private readonly IEduGuardClient _eduguard; private readonly string _key;
    public EduGuardCompatibilityController(ILibraryCirculationService service, ICirculationRepository repo, IEduGuardClient eduguard, IConfiguration config) => (_service, _repo, _eduguard, _key) = (service, repo, eduguard, config["LMS_SERVICE_KEY"] ?? "");

    [HttpGet("students/{studentId}/issued")]
    public async Task<IActionResult> Issued(string studentId, CancellationToken token)
    { if (!Authorized()) return Unauthorized(); var identity = await _eduguard.IdentityAsync(studentId, token); var actor = new LmsActor("eduguard", "college-admin", identity.CollegeId, "EduGuard", ""); var issued = await _service.IssuedAsync(actor, studentId, true, token); return Ok(new { data = issued.Select(x => new { bookId = x.BookId, title = x.BookTitle, issueDate = x.IssueDate, dueDate = x.DueDate, status = x.Status }) }); }
    [HttpPost("students/{studentId}/issue")]
    public async Task<IActionResult> Issue(string studentId, [FromBody] CompatibilityBook book, CancellationToken token)
    { if (!Authorized()) return Unauthorized(); var identity = await _eduguard.IdentityAsync(studentId, token); var actor = new LmsActor("eduguard", "librarian", identity.CollegeId, "EduGuard", ""); var issued = await _service.IssueAsync(actor, studentId, book.BookId, $"compat-issue:{studentId}:{book.BookId}:{book.IssueDate.Ticks}", token); return Ok(new { data = new { bookId = issued.BookId, title = issued.BookTitle, issueDate = issued.IssueDate, dueDate = issued.DueDate, status = issued.Status } }); }
    [HttpPost("students/{studentId}/return")]
    public async Task<IActionResult> Return(string studentId, [FromBody] CompatibilityReturn request, CancellationToken token)
    { if (!Authorized()) return Unauthorized(); var identity = await _eduguard.IdentityAsync(studentId, token); var actor = new LmsActor("eduguard", "librarian", identity.CollegeId, "EduGuard", ""); var issuance = (await _repo.StudentIssuedAsync(studentId, true, token)).FirstOrDefault(x => x.BookId == request.BookId) ?? throw new KeyNotFoundException(); var returned = await _service.ReturnAsync(actor, issuance.Id!, $"compat-return:{studentId}:{request.BookId}", token); return Ok(new { data = returned }); }
    private bool Authorized() { var supplied = Request.Headers["X-EduGuard-Service-Key"].FirstOrDefault() ?? ""; return _key.Length > 0 && supplied.Length == _key.Length && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(_key)); }
}

public sealed record IssueRequest(string StudentId, string BookId);
public sealed record ReserveRequest(string StudentId, string BookId);
public sealed record FineActionRequest(decimal Amount, string? Reason);
public sealed record LibrarianRequest(string Name, string Email, string Password);
public sealed record LibrarianStatusRequest(string Status, string? Name = null, string? Email = null, string? Password = null);
public sealed record CompatibilityBook(string BookId, string Title, DateTime IssueDate, DateTime DueDate, string Status);
public sealed record CompatibilityReturn(string BookId);
public sealed record ExchangeRequest(string Token);
public sealed record LibrarianLoginRequest(string Email, string Password);
