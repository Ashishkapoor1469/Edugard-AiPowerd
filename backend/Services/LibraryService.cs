using EduGuard.Models;
using MongoDB.Driver;

namespace EduGuard.Services;

public interface ILibraryService
{
    Task<IReadOnlyList<IssuedBook>> GetIssuedBooksAsync(string studentId, CancellationToken token = default);
    Task<IssuedBook> IssueBookAsync(string studentId, IssuedBook book, CancellationToken token = default);
    Task ReturnBookAsync(string studentId, string bookId, CancellationToken token = default);
}

// Mongo is the V3 placeholder. A future LMS adapter implements the same contract.
public sealed class MongoLibraryService : ILibraryService
{
    private readonly MongoService _mongo;
    public MongoLibraryService(MongoService mongo) => _mongo = mongo;

    public async Task<IReadOnlyList<IssuedBook>> GetIssuedBooksAsync(string studentId, CancellationToken token = default)
    {
        var student = await _mongo.Students.Find(x => x.Id == studentId).FirstOrDefaultAsync(token)
            ?? throw new KeyNotFoundException("Student not found");
        return (student.IssuedBooks ?? []).Where(x => x.Status == "active").OrderBy(x => x.DueDate).ToList();
    }

    public async Task<IssuedBook> IssueBookAsync(string studentId, IssuedBook book, CancellationToken token = default)
    {
        if (string.IsNullOrWhiteSpace(book.BookId) || string.IsNullOrWhiteSpace(book.Title) || book.DueDate <= book.IssueDate)
            throw new ArgumentException("A book ID, title, and valid issue/due dates are required");

        book.Status = "active";
        var filter = Builders<Student>.Filter.Eq(x => x.Id, studentId)
            & Builders<Student>.Filter.Not(Builders<Student>.Filter.ElemMatch(x => x.IssuedBooks, x => x.BookId == book.BookId && x.Status == "active"))
            & Builders<Student>.Filter.Where(x => x.IssuedBooks.Count(b => b.Status == "active") < 2);
        var result = await _mongo.Students.UpdateOneAsync(filter, Builders<Student>.Update.Push(x => x.IssuedBooks, book), cancellationToken: token);
        if (result.ModifiedCount == 0) throw new InvalidOperationException("Student already has this book or the two-book active limit was reached");
        return book;
    }

    public async Task ReturnBookAsync(string studentId, string bookId, CancellationToken token = default)
    {
        var result = await _mongo.Students.UpdateOneAsync(
            x => x.Id == studentId && x.IssuedBooks.Any(b => b.BookId == bookId && b.Status == "active"),
            Builders<Student>.Update.Set("issuedBooks.$.status", "returned"), cancellationToken: token);
        if (result.ModifiedCount == 0) throw new KeyNotFoundException("Active book issue not found");
    }
}
