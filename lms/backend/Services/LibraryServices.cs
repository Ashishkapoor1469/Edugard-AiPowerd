using System.Net.Http.Json;
using System.Text.Json;
using ExcelDataReader;
using Lms.Api.Data;
using Lms.Api.Models;
using Microsoft.Extensions.Caching.Distributed;
using MongoDB.Driver;

namespace Lms.Api.Services;

public sealed record EduGuardIdentity(string Id, string Name, string Email, string Role, string CollegeId, string Status, string? DegreeId, string? Course, string? ClassName, string? RollNo, string? PhoneNo, int Semester);
public sealed record LibrarianIdentity(string Id, string Name, string Email);
public sealed record LmsActor(string Id, string Role, string CollegeId, string Name, string Email);
public sealed record PushRequest(string UserId, string IdempotencyKey, string Title, string Body, string Priority, Dictionary<string, string> Data);

public interface IEduGuardClient
{
    Task<EduGuardIdentity> IdentityAsync(string id, CancellationToken token);
    Task<IReadOnlyList<EduGuardIdentity>> SearchStudentsAsync(string collegeId, string search, CancellationToken token);
    Task<LmsActor> ValidateSsoAsync(string tokenValue, CancellationToken token);
    Task<LmsActor> LibrarianLoginAsync(string email, string password, CancellationToken token);
    Task NotifyAsync(PushRequest request, CancellationToken token);
    Task<JsonElement> LibrariansAsync(string collegeId, string actorId, CancellationToken token);
    Task<JsonElement> CreateLibrarianAsync(string collegeId, string actorId, string name, string email, string password, CancellationToken token);
    Task UpdateLibrarianAsync(string id, string actorId, string status, string? name, string? email, string? password, CancellationToken token);
    Task DeleteLibrarianAsync(string id, string actorId, CancellationToken token);
    Task<IReadOnlyList<LibrarianIdentity>> ActiveLibrariansAsync(string collegeId, CancellationToken token);
}

public sealed class EduGuardClient : IEduGuardClient
{
    private readonly HttpClient _http;
    public EduGuardClient(HttpClient http, IConfiguration config)
    {
        _http = http; _http.BaseAddress = new Uri(config["EDUGUARD_API_URL"] ?? "http://localhost:5000");
        _http.DefaultRequestHeaders.Add("X-LMS-Service-Key", config["LMS_SERVICE_KEY"] ?? string.Empty);
    }
    public async Task<EduGuardIdentity> IdentityAsync(string id, CancellationToken token)
    {
        var response = await _http.GetAsync($"/api/integrations/lms/identities/{id}", token); response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EduGuardIdentity>(cancellationToken: token))!;
    }
    public async Task<IReadOnlyList<EduGuardIdentity>> SearchStudentsAsync(string collegeId, string search, CancellationToken token)
    {
        var response = await _http.GetAsync($"/api/integrations/lms/colleges/{collegeId}/students?search={Uri.EscapeDataString(search)}", token); response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StudentEnvelope>(cancellationToken: token))?.Data ?? [];
    }
    public async Task<LmsActor> ValidateSsoAsync(string tokenValue, CancellationToken token)
    {
        var response = await _http.PostAsJsonAsync("/api/integrations/lms/sso/validate", new { token = tokenValue }, token);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LmsActor>(cancellationToken: token))!;
    }
    public async Task<LmsActor> LibrarianLoginAsync(string email, string password, CancellationToken token)
    {
        var response = await _http.PostAsJsonAsync("/api/integrations/lms/librarians/authenticate", new { email, password }, token);
        if (!response.IsSuccessStatusCode) throw new UnauthorizedAccessException("Invalid librarian email or password.");
        return (await response.Content.ReadFromJsonAsync<LmsActor>(cancellationToken: token))!;
    }
    public async Task NotifyAsync(PushRequest request, CancellationToken token)
    { var response = await _http.PostAsJsonAsync("/api/integrations/lms/push", request, token); response.EnsureSuccessStatusCode(); }
    public async Task<JsonElement> LibrariansAsync(string collegeId, string actorId, CancellationToken token)
    { var response = await _http.GetAsync($"/api/integrations/lms/colleges/{collegeId}/librarians?actorId={Uri.EscapeDataString(actorId)}", token); response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: token); }
    public async Task<JsonElement> CreateLibrarianAsync(string collegeId, string actorId, string name, string email, string password, CancellationToken token)
    { var response = await _http.PostAsJsonAsync($"/api/integrations/lms/colleges/{collegeId}/librarians", new { actorId, name, email, password }, token); if (!response.IsSuccessStatusCode) throw new InvalidOperationException(await response.Content.ReadAsStringAsync(token)); return await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: token); }
    public async Task UpdateLibrarianAsync(string id, string actorId, string status, string? name, string? email, string? password, CancellationToken token)
    { var response = await _http.PatchAsJsonAsync($"/api/integrations/lms/librarians/{id}", new { actorId, status, name, email, password }, token); if (!response.IsSuccessStatusCode) throw new InvalidOperationException(await response.Content.ReadAsStringAsync(token)); }
    public async Task DeleteLibrarianAsync(string id, string actorId, CancellationToken token)
    { var response = await _http.DeleteAsync($"/api/integrations/lms/librarians/{id}?actorId={Uri.EscapeDataString(actorId)}", token); response.EnsureSuccessStatusCode(); }
    public async Task<IReadOnlyList<LibrarianIdentity>> ActiveLibrariansAsync(string collegeId, CancellationToken token)
    {
        var response = await _http.GetAsync($"/api/integrations/lms/colleges/{collegeId}/librarians/internal", token); response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<LibrarianEnvelope>(cancellationToken: token); return envelope?.Data ?? [];
    }
    private sealed record LibrarianEnvelope(List<LibrarianIdentity> Data);
    private sealed record StudentEnvelope(List<EduGuardIdentity> Data);
}

public interface ICatalogService
{
    Task<CatalogPage> SearchAsync(string collegeId, CatalogQuery query, CancellationToken token);
    Task<Book> SaveAsync(LmsActor actor, Book book, CancellationToken token);
    Task<IReadOnlyList<Book>> ImportAsync(LmsActor actor, Stream excel, CancellationToken token);
}

public sealed class CatalogService : ICatalogService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IBookRepository _books;
    private readonly ICirculationRepository _circulation;
    private readonly IDistributedCache _cache;
    public CatalogService(IBookRepository books, ICirculationRepository circulation, IDistributedCache cache) => (_books, _circulation, _cache) = (books, circulation, cache);

    public async Task<CatalogPage> SearchAsync(string collegeId, CatalogQuery query, CancellationToken token)
    {
        var version = (await _circulation.GetSettingsAsync(collegeId, token)).CatalogVersion;
        var key = $"lms:catalog:{collegeId}:{version}:{query.Search}:{query.Category}:{query.Available}:{query.Page}:{query.Limit}";
        var cached = await _cache.GetStringAsync(key, token);
        if (cached != null) return JsonSerializer.Deserialize<CatalogPage>(cached, JsonOptions)!;
        var page = await _books.SearchAsync(collegeId, query, token);
        await _cache.SetStringAsync(key, JsonSerializer.Serialize(page, JsonOptions), new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30) }, token);
        return page;
    }

    public async Task<Book> SaveAsync(LmsActor actor, Book book, CancellationToken token)
    {
        RequireLibraryWrite(actor); Validate(book); book.CollegeId = actor.CollegeId;
        var isNew = string.IsNullOrEmpty(book.Id);
        if (!string.IsNullOrEmpty(book.Id))
        {
            var existing = await _books.GetAsync(actor.CollegeId, book.Id, token) ?? throw new KeyNotFoundException("Book not found.");
            var checkedOut = existing.TotalCopies - existing.AvailableCopies;
            if (book.TotalCopies < checkedOut) throw new InvalidOperationException("Total copies cannot be less than checked-out copies.");
            book.AvailableCopies = book.TotalCopies - checkedOut; book.BorrowCount = existing.BorrowCount; book.CreatedAt = existing.CreatedAt;
        }
        else book.AvailableCopies = book.TotalCopies;
        var saved = await _books.SaveAsync(book, token); await BumpCatalogAsync(actor.CollegeId, token);
        await _circulation.AddAuditAsync(new() { CollegeId = actor.CollegeId, ActorId = actor.Id, Action = isNew ? "book.add" : "book.edit", EntityType = "book", EntityId = saved.Id! }, token);
        return saved;
    }

    public async Task<IReadOnlyList<Book>> ImportAsync(LmsActor actor, Stream excel, CancellationToken token)
    {
        RequireLibraryWrite(actor); System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        using var reader = ExcelReaderFactory.CreateReader(excel); var data = reader.AsDataSet(); var table = data.Tables[0];
        if (table.Rows.Count < 2) return [];
        var headers = table.Rows[0].ItemArray.Select((x, i) => (Name: x?.ToString()?.Trim().ToLowerInvariant(), Index: i)).Where(x => x.Name != null).ToDictionary(x => x.Name!, x => x.Index);
        string Cell(System.Data.DataRow row, string name) => headers.TryGetValue(name, out var i) ? row[i]?.ToString()?.Trim() ?? "" : "";
        var books = new List<Book>();
        foreach (System.Data.DataRow row in table.Rows.Cast<System.Data.DataRow>().Skip(1))
        {
            var title = Cell(row, "title"); if (string.IsNullOrWhiteSpace(title)) continue;
            if (!int.TryParse(Cell(row, "total copies"), out var copies)) int.TryParse(Cell(row, "totalcopies"), out copies);
            var book = new Book { Title = title, Author = Cell(row, "author"), Isbn = Cell(row, "isbn"), Category = Cell(row, "category"), TotalCopies = copies, ShelfLocation = Cell(row, "shelf location"), CoverImage = Cell(row, "cover image") };
            Validate(book); books.Add(book);
        }
        var saved = await _books.ImportAsync(actor.CollegeId, books, token); await BumpCatalogAsync(actor.CollegeId, token);
        await _circulation.AddAuditAsync(new() { CollegeId = actor.CollegeId, ActorId = actor.Id, Action = "book.bulk-import", EntityType = "book", EntityId = "batch", Details = new() { ["count"] = saved.Count.ToString() } }, token);
        return saved;
    }

    private async Task BumpCatalogAsync(string collegeId, CancellationToken token) { var settings = await _circulation.GetSettingsAsync(collegeId, token); settings.CatalogVersion++; await _circulation.SaveSettingsAsync(settings, token); }
    private static void RequireLibraryWrite(LmsActor actor) { if (actor.Role != "librarian") throw new UnauthorizedAccessException(); }
    private static void Validate(Book book)
    { if (string.IsNullOrWhiteSpace(book.Title) || string.IsNullOrWhiteSpace(book.Author) || string.IsNullOrWhiteSpace(book.Isbn) || book.TotalCopies < 0) throw new ArgumentException("Title, author, ISBN, and non-negative total copies are required."); }
}

public interface ILibraryCirculationService
{
    Task<IReadOnlyList<Issuance>> IssuedAsync(LmsActor actor, string studentId, bool activeOnly, CancellationToken token);
    Task<Issuance> IssueAsync(LmsActor actor, string studentId, string bookId, string key, CancellationToken token);
    Task<Issuance> ReturnAsync(LmsActor actor, string issuanceId, string key, CancellationToken token);
    Task<Issuance> RenewAsync(LmsActor actor, string issuanceId, string key, CancellationToken token);
    Task<Reservation> ReserveAsync(LmsActor actor, string studentId, string bookId, string key, CancellationToken token);
}

public sealed class LibraryCirculationService : ILibraryCirculationService
{
    private readonly IBookRepository _books; private readonly ICirculationRepository _repo; private readonly LmsMongoContext _db;
    public LibraryCirculationService(IBookRepository books, ICirculationRepository repo, LmsMongoContext db) => (_books, _repo, _db) = (books, repo, db);

    public async Task<IReadOnlyList<Issuance>> IssuedAsync(LmsActor actor, string studentId, bool activeOnly, CancellationToken token)
    { await VerifyStudentAccessAsync(actor, studentId, token); return await _repo.StudentIssuedAsync(studentId, activeOnly, token); }

    public async Task<Issuance> IssueAsync(LmsActor actor, string studentId, string bookId, string key, CancellationToken token)
    {
        RequireStaff(actor); RequireKey(key); var student = await VerifyStudentAccessAsync(actor, studentId, token);
        var book = await _books.GetAsync(actor.CollegeId, bookId, token) ?? throw new KeyNotFoundException("Book not found.");
        var settings = await _repo.GetSettingsAsync(actor.CollegeId, token);
        const int limit = 2;
        if (await _repo.ActiveCountAsync(studentId, token) >= limit) throw new InvalidOperationException($"Student has reached the active issue limit of {limit}.");
        var issuance = await _repo.IssueAsync(new Issuance { CollegeId = actor.CollegeId, BookId = book.Id!, StudentId = studentId, DegreeId = student.DegreeId, ClassName = student.ClassName ?? "", BookTitle = book.Title, IssueDate = DateTime.UtcNow, DueDate = DateTime.UtcNow.Date.AddDays(settings.LoanDays), IssueIdempotencyKey = $"{actor.CollegeId}:{key}", IssuedBy = actor.Id }, limit, token);
        settings.CatalogVersion++; await _repo.SaveSettingsAsync(settings, token);
        await AuditAsync(actor, "issuance.issue", issuance.Id!, new() { ["studentId"] = studentId, ["bookId"] = bookId }, token); return issuance;
    }

    public async Task<Issuance> ReturnAsync(LmsActor actor, string issuanceId, string key, CancellationToken token)
    {
        RequireStaff(actor); RequireKey(key); var issuance = await _repo.ReturnAsync(actor.CollegeId, issuanceId, actor.Id, $"{actor.CollegeId}:{key}", token);
        var settings = await _repo.GetSettingsAsync(actor.CollegeId, token); settings.CatalogVersion++; await _repo.SaveSettingsAsync(settings, token);
        await AuditAsync(actor, "issuance.return", issuance.Id!, new() { ["studentId"] = issuance.StudentId, ["bookId"] = issuance.BookId }, token); return issuance;
    }

    public async Task<Issuance> RenewAsync(LmsActor actor, string issuanceId, string key, CancellationToken token)
    {
        RequireStaff(actor); RequireKey(key); var settings = await _repo.GetSettingsAsync(actor.CollegeId, token);
        var issuance = (await _repo.ListIssuancesAsync(actor.CollegeId, null, null, token)).FirstOrDefault(x => x.Id == issuanceId) ?? throw new KeyNotFoundException("Issuance not found.");
        if ((await _repo.ReservationsAsync(actor.CollegeId, null, issuance.BookId, "queued", token)).Count > 0) throw new InvalidOperationException("Book has queued reservations and cannot be renewed.");
        var renewed = await _repo.RenewAsync(actor.CollegeId, issuanceId, actor.Id, $"{actor.CollegeId}:{key}", settings.LoanDays, token);
        await AuditAsync(actor, "issuance.renew", renewed.Id!, new(), token); return renewed;
    }

    public async Task<Reservation> ReserveAsync(LmsActor actor, string studentId, string bookId, string key, CancellationToken token)
    {
        RequireStaff(actor); RequireKey(key); await VerifyStudentAccessAsync(actor, studentId, token); var book = await _books.GetAsync(actor.CollegeId, bookId, token) ?? throw new KeyNotFoundException("Book not found.");
        if (book.AvailableCopies > 0) throw new InvalidOperationException("A copy is available; reservation is not required.");
        var reservation = await _repo.ReserveAsync(new() { CollegeId = actor.CollegeId, BookId = bookId, StudentId = studentId, BookTitle = book.Title, IdempotencyKey = $"{actor.CollegeId}:{key}" }, token);
        await AuditAsync(actor, "reservation.create", reservation.Id!, new() { ["studentId"] = studentId, ["bookId"] = bookId }, token); return reservation;
    }

    private async Task<EduGuardIdentity> VerifyStudentAccessAsync(LmsActor actor, string studentId, CancellationToken token)
    {
        if (actor.Role is not ("librarian" or "college-admin")) throw new UnauthorizedAccessException();
        var student = await _db.Students.Find(x => x.CollegeId == actor.CollegeId && x.EduGuardStudentId == studentId).FirstOrDefaultAsync(token)
            ?? throw new InvalidOperationException("Register this EduGuard student in LMS before circulation.");
        return new(student.EduGuardStudentId, student.Name, student.Email, "student", student.CollegeId, "approved", student.CourseId, student.Course, student.ClassName, student.RollNo, student.PhoneNo, student.Semester);
    }
    private Task AuditAsync(LmsActor actor, string action, string id, Dictionary<string, string> details, CancellationToken token) => _repo.AddAuditAsync(new() { CollegeId = actor.CollegeId, ActorId = actor.Id, Action = action, EntityType = action.Split('.')[0], EntityId = id, Details = details }, token);
    private static void RequireStaff(LmsActor actor) { if (actor.Role != "librarian") throw new UnauthorizedAccessException(); }
    private static void RequireKey(string key) { if (string.IsNullOrWhiteSpace(key) || key.Length > 200) throw new ArgumentException("An Idempotency-Key header is required."); }
}
