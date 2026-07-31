using System.Net.Http.Json;
using System.Text.Json;
using EduGuard.Models;
using MongoDB.Driver;

namespace EduGuard.Services;

public interface ILibraryService
{
    Task<IReadOnlyList<IssuedBook>> GetIssuedBooksAsync(string studentId, CancellationToken token = default);
    Task<IssuedBook> IssueBookAsync(string studentId, IssuedBook book, CancellationToken token = default);
    Task ReturnBookAsync(string studentId, string bookId, CancellationToken token = default);
}

public sealed class HttpLibraryService : ILibraryService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    private readonly MongoService _mongo;
    private readonly bool _integrationEnabled;
    public HttpLibraryService(HttpClient http, IConfiguration config, MongoService mongo)
    {
        _http = http;
        _mongo = mongo;
        _integrationEnabled = config.GetValue("LMS_INTEGRATION_ENABLED", false);
        _http.BaseAddress = new Uri(config["LMS_API_URL"] ?? "http://localhost:5100");
        _http.DefaultRequestHeaders.Add("X-EduGuard-Service-Key", config["LMS_SERVICE_KEY"] ?? string.Empty);
    }

    public async Task<IReadOnlyList<IssuedBook>> GetIssuedBooksAsync(string studentId, CancellationToken token = default)
    {
        if (!_integrationEnabled)
        {
            var student = await _mongo.Students.Find(x => x.Id == studentId).FirstOrDefaultAsync(token) ?? throw new KeyNotFoundException("Student not found");
            return (student.IssuedBooks ?? []).Where(x => x.Status == "active").OrderBy(x => x.DueDate).ToList();
        }
        var response = await _http.GetAsync($"/api/internal/eduguard/students/{studentId}/issued", token);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LibraryResponse<List<IssuedBook>>>(JsonOptions, token))?.Data ?? [];
    }

    public async Task<IssuedBook> IssueBookAsync(string studentId, IssuedBook book, CancellationToken token = default)
    {
        if (!_integrationEnabled)
        {
            if (string.IsNullOrWhiteSpace(book.BookId) || string.IsNullOrWhiteSpace(book.Title) || book.DueDate <= book.IssueDate) throw new ArgumentException("A book ID, title, and valid issue/due dates are required");
            book.Status = "active";
            var filter = Builders<Student>.Filter.Eq(x => x.Id, studentId)
                & Builders<Student>.Filter.Not(Builders<Student>.Filter.ElemMatch(x => x.IssuedBooks, x => x.BookId == book.BookId && x.Status == "active"))
                & Builders<Student>.Filter.Where(x => x.IssuedBooks.Count(b => b.Status == "active") < 2);
            var result = await _mongo.Students.UpdateOneAsync(filter, Builders<Student>.Update.Push(x => x.IssuedBooks, book), cancellationToken: token);
            if (result.ModifiedCount == 0) throw new InvalidOperationException("Student already has this book or the two-book active limit was reached");
            return book;
        }
        var response = await _http.PostAsJsonAsync($"/api/internal/eduguard/students/{studentId}/issue", book, token);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LibraryResponse<IssuedBook>>(JsonOptions, token))!.Data;
    }

    public async Task ReturnBookAsync(string studentId, string bookId, CancellationToken token = default)
    {
        if (!_integrationEnabled)
        {
            var result = await _mongo.Students.UpdateOneAsync(x => x.Id == studentId && x.IssuedBooks.Any(b => b.BookId == bookId && b.Status == "active"), Builders<Student>.Update.Set("issuedBooks.$.status", "returned"), cancellationToken: token);
            if (result.ModifiedCount == 0) throw new KeyNotFoundException("Active book issue not found");
            return;
        }
        var response = await _http.PostAsJsonAsync($"/api/internal/eduguard/students/{studentId}/return", new { bookId }, token);
        response.EnsureSuccessStatusCode();
    }

    private sealed record LibraryResponse<T>(T Data);
}
