using Lms.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Lms.Api.Data;

public sealed class LmsMongoContext
{
    public IMongoClient Client { get; }
    public IMongoCollection<LibraryStudent> Students { get; }
    public IMongoCollection<Book> Books { get; }
    public IMongoCollection<Issuance> Issuances { get; }
    public IMongoCollection<Reservation> Reservations { get; }
    public IMongoCollection<Fine> Fines { get; }
    public IMongoCollection<LibrarySettings> Settings { get; }
    public IMongoCollection<LibrarianPreferences> Preferences { get; }
    public IMongoCollection<LibraryAudit> Audits { get; }
    public IMongoCollection<Wishlist> Wishlists { get; }
    public IMongoCollection<LibraryAnnouncement> Announcements { get; }


    public LmsMongoContext(IConfiguration config)
    {
        var url = new MongoUrl(config["LMS_MONGO_URI"] ?? "mongodb://127.0.0.1:27017/eduguard_lms");
        Client = new MongoClient(MongoClientSettings.FromConnectionString(url.Url));
        var dbName = string.IsNullOrWhiteSpace(url.DatabaseName) ? "eduguard_lms" : url.DatabaseName;
        var database = Client.GetDatabase(dbName);
        Students = database.GetCollection<LibraryStudent>("students");
        Books = database.GetCollection<Book>("books");
        Issuances = database.GetCollection<Issuance>("issuances");
        Reservations = database.GetCollection<Reservation>("reservations");
        Fines = database.GetCollection<Fine>("fines");
        Settings = database.GetCollection<LibrarySettings>("settings");
        Preferences = database.GetCollection<LibrarianPreferences>("librarian_preferences");
        Audits = database.GetCollection<LibraryAudit>("audits");
        Wishlists = database.GetCollection<Wishlist>("wishlists");
        Announcements = database.GetCollection<LibraryAnnouncement>("announcements");
    }

    public async Task EnsureIndexesAsync(CancellationToken token = default)
    {
        try { await Students.Indexes.DropOneAsync("collegeId_1_eduguardStudentId_1", token); } catch { }
        try { await Students.Indexes.DropOneAsync("collegeId_1_eduGuardStudentId_1", token); } catch { }

        try
        {
            await Students.Indexes.CreateManyAsync([
                new(Builders<LibraryStudent>.IndexKeys.Ascending(x => x.CollegeId).Ascending(x => x.EduGuardStudentId), new CreateIndexOptions { Unique = true, Sparse = true }),
                new(Builders<LibraryStudent>.IndexKeys.Ascending(x => x.CollegeId).Ascending(x => x.RollNo))
            ], token);
        }
        catch (Exception ex) { Console.WriteLine($"[Warning] Students index: {ex.Message}"); }

        try
        {
            await Books.Indexes.CreateManyAsync([
                new(Builders<Book>.IndexKeys.Ascending(x => x.CollegeId).Ascending(x => x.Isbn), new CreateIndexOptions { Unique = true }),
                new(Builders<Book>.IndexKeys.Text(x => x.Title).Text(x => x.Author).Text(x => x.Isbn).Text(x => x.Category).Text(x => x.Department).Text(x => x.Publisher)),
                new(Builders<Book>.IndexKeys.Ascending(x => x.CollegeId).Ascending(x => x.Category).Descending(x => x.AvailableCopies))
            ], token);
        }
        catch (Exception ex) { Console.WriteLine($"[Warning] Books index: {ex.Message}"); }

        try
        {
            await Issuances.Indexes.CreateManyAsync([
                new(Builders<Issuance>.IndexKeys.Ascending(x => x.IssueIdempotencyKey), new CreateIndexOptions { Unique = true }),
                new(Builders<Issuance>.IndexKeys.Ascending(x => x.StudentId).Ascending(x => x.ActiveSlot), new CreateIndexOptions<Issuance> { Unique = true, PartialFilterExpression = Builders<Issuance>.Filter.Eq(x => x.Status, "active") & Builders<Issuance>.Filter.Exists(x => x.ActiveSlot) }),
                new(Builders<Issuance>.IndexKeys.Ascending(x => x.StudentId).Ascending(x => x.Status)),
                new(Builders<Issuance>.IndexKeys.Ascending(x => x.BookId).Ascending(x => x.Status)),
                new(Builders<Issuance>.IndexKeys.Ascending(x => x.CollegeId).Ascending(x => x.Status).Ascending(x => x.DueDate))
            ], token);
        }
        catch (Exception ex) { Console.WriteLine($"[Warning] Issuances index: {ex.Message}"); }

        try
        {
            await Reservations.Indexes.CreateManyAsync([
                new(Builders<Reservation>.IndexKeys.Ascending(x => x.IdempotencyKey), new CreateIndexOptions { Unique = true }),
                new(Builders<Reservation>.IndexKeys.Ascending(x => x.BookId).Ascending(x => x.Status).Ascending(x => x.CreatedAt)),
                new(Builders<Reservation>.IndexKeys.Ascending(x => x.StudentId).Ascending(x => x.Status))
            ], token);
        }
        catch (Exception ex) { Console.WriteLine($"[Warning] Reservations index: {ex.Message}"); }

        try { await Fines.Indexes.CreateManyAsync([new CreateIndexModel<Fine>(Builders<Fine>.IndexKeys.Ascending(x => x.IssuanceId), new CreateIndexOptions { Unique = true })], token); } catch { }
        try { await Settings.Indexes.CreateManyAsync([new CreateIndexModel<LibrarySettings>(Builders<LibrarySettings>.IndexKeys.Ascending(x => x.CollegeId), new CreateIndexOptions { Unique = true })], token); } catch { }
        try { await Preferences.Indexes.CreateManyAsync([new CreateIndexModel<LibrarianPreferences>(Builders<LibrarianPreferences>.IndexKeys.Ascending(x => x.LibrarianId), new CreateIndexOptions { Unique = true })], token); } catch { }
        try { await Audits.Indexes.CreateManyAsync([new CreateIndexModel<LibraryAudit>(Builders<LibraryAudit>.IndexKeys.Ascending(x => x.CollegeId).Descending(x => x.CreatedAt))], token); } catch { }
        try { await Wishlists.Indexes.CreateManyAsync([new CreateIndexModel<Wishlist>(Builders<Wishlist>.IndexKeys.Ascending(x => x.CollegeId).Ascending(x => x.StudentId).Ascending(x => x.BookId), new CreateIndexOptions { Unique = true })], token); } catch { }
        try { await Announcements.Indexes.CreateManyAsync([new CreateIndexModel<LibraryAnnouncement>(Builders<LibraryAnnouncement>.IndexKeys.Ascending(x => x.CollegeId).Descending(x => x.CreatedAt))], token); } catch { }
    }
}

public sealed record CatalogQuery(string? Search, string? Category, string? Department, string? Language, bool? Available, int Page, int Limit);
public sealed record CatalogPage(IReadOnlyList<Book> Items, long Total, int Page, int Pages);

public interface IBookRepository
{
    Task<CatalogPage> SearchAsync(string collegeId, CatalogQuery query, CancellationToken token);
    Task<Book?> GetAsync(string collegeId, string id, CancellationToken token);
    Task<Book?> GetByBarcodeOrAccessionAsync(string collegeId, string code, CancellationToken token);
    Task<Book> SaveAsync(Book book, CancellationToken token);
    Task<bool> DeactivateAsync(string collegeId, string id, CancellationToken token);
    Task<IReadOnlyList<Book>> ImportAsync(string collegeId, IReadOnlyList<Book> books, CancellationToken token);
    Task<IReadOnlyList<Book>> LowStockCandidatesAsync(CancellationToken token);
}

public sealed class MongoBookRepository : IBookRepository
{
    private readonly LmsMongoContext _db;
    public MongoBookRepository(LmsMongoContext db) => _db = db;

    public async Task<CatalogPage> SearchAsync(string collegeId, CatalogQuery query, CancellationToken token)
    {
        var filter = Builders<Book>.Filter.Eq(x => x.CollegeId, collegeId) & Builders<Book>.Filter.Eq(x => x.IsActive, true);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            filter &= (Builders<Book>.Filter.Text(term) |
                      Builders<Book>.Filter.Regex(x => x.Title, new BsonRegularExpression(term, "i")) |
                      Builders<Book>.Filter.Regex(x => x.Author, new BsonRegularExpression(term, "i")) |
                      Builders<Book>.Filter.Regex(x => x.Isbn, new BsonRegularExpression(term, "i")));
        }
        if (!string.IsNullOrWhiteSpace(query.Category)) filter &= Builders<Book>.Filter.Eq(x => x.Category, query.Category.Trim());
        if (!string.IsNullOrWhiteSpace(query.Department)) filter &= Builders<Book>.Filter.Eq(x => x.Department, query.Department.Trim());
        if (!string.IsNullOrWhiteSpace(query.Language)) filter &= Builders<Book>.Filter.Eq(x => x.Language, query.Language.Trim());
        if (query.Available == true) filter &= Builders<Book>.Filter.Gt(x => x.AvailableCopies, 0);
        if (query.Available == false) filter &= Builders<Book>.Filter.Eq(x => x.AvailableCopies, 0);
        var page = Math.Max(1, query.Page);
        var limit = Math.Clamp(query.Limit, 1, 100);
        var total = await _db.Books.CountDocumentsAsync(filter, cancellationToken: token);
        var items = await _db.Books.Find(filter).SortBy(x => x.Title).Skip((page - 1) * limit).Limit(limit).ToListAsync(token);
        return new(items, total, page, (int)Math.Ceiling(total / (double)limit));
    }

    public Task<Book?> GetAsync(string collegeId, string id, CancellationToken token) =>
        _db.Books.Find(x => x.Id == id && x.CollegeId == collegeId && x.IsActive).FirstOrDefaultAsync(token)!;

    public Task<Book?> GetByBarcodeOrAccessionAsync(string collegeId, string code, CancellationToken token)
    {
        var clean = code.Trim();
        var filter = Builders<Book>.Filter.Eq(x => x.CollegeId, collegeId) & Builders<Book>.Filter.Eq(x => x.IsActive, true) &
                     (Builders<Book>.Filter.Eq(x => x.Isbn, clean) |
                      Builders<Book>.Filter.ElemMatch(x => x.PhysicalCopies, c => c.AccessionNumber == clean || c.Barcode == clean));
        return _db.Books.Find(filter).FirstOrDefaultAsync(token)!;
    }

    public async Task<Book> SaveAsync(Book book, CancellationToken token)
    {
        book.UpdatedAt = DateTime.UtcNow;
        if (book.PhysicalCopies == null || book.PhysicalCopies.Count == 0)
        {
            book.PhysicalCopies = Enumerable.Range(1, Math.Max(1, book.TotalCopies)).Select(i => new PhysicalCopy
            {
                AccessionNumber = $"{book.Isbn.Replace("-", "")}-{i:D3}",
                Barcode = $"BC-{book.Isbn.Replace("-", "")}-{i:D3}",
                Status = "available",
                ShelfLocation = book.ShelfLocation
            }).ToList();
        }
        if (string.IsNullOrEmpty(book.Id)) await _db.Books.InsertOneAsync(book, cancellationToken: token);
        else await _db.Books.ReplaceOneAsync(x => x.Id == book.Id && x.CollegeId == book.CollegeId, book, cancellationToken: token);
        return book;
    }


    public async Task<bool> DeactivateAsync(string collegeId, string id, CancellationToken token)
    {
        var result = await _db.Books.UpdateOneAsync(x => x.Id == id && x.CollegeId == collegeId && x.IsActive, Builders<Book>.Update.Set(x => x.IsActive, false).Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);
        return result.ModifiedCount == 1;
    }

    public async Task<IReadOnlyList<Book>> ImportAsync(string collegeId, IReadOnlyList<Book> books, CancellationToken token)
    {
        var saved = new List<Book>();
        foreach (var row in books)
        {
            var existing = await _db.Books.Find(x => x.CollegeId == collegeId && x.Isbn == row.Isbn).FirstOrDefaultAsync(token);
            if (existing == null) { row.CollegeId = collegeId; row.AvailableCopies = row.TotalCopies; await _db.Books.InsertOneAsync(row, cancellationToken: token); saved.Add(row); continue; }
            var loaned = existing.TotalCopies - existing.AvailableCopies;
            existing.Title = row.Title; existing.Author = row.Author; existing.Category = row.Category; existing.ShelfLocation = row.ShelfLocation; existing.CoverImage = row.CoverImage;
            existing.TotalCopies = row.TotalCopies; existing.AvailableCopies = Math.Max(0, row.TotalCopies - loaned); existing.UpdatedAt = DateTime.UtcNow;
            await _db.Books.ReplaceOneAsync(x => x.Id == existing.Id, existing, cancellationToken: token); saved.Add(existing);
        }
        return saved;
    }

    public Task<IReadOnlyList<Book>> LowStockCandidatesAsync(CancellationToken token) =>
        _db.Books.Find(x => x.IsActive && x.AvailableCopies == 0).ToListAsync(token).ContinueWith<IReadOnlyList<Book>>(x => x.Result, token);
}

public interface ICirculationRepository
{
    Task<LibrarySettings> GetSettingsAsync(string collegeId, CancellationToken token);
    Task<LibrarySettings> SaveSettingsAsync(LibrarySettings settings, CancellationToken token);
    Task<IReadOnlyList<Issuance>> StudentIssuedAsync(string studentId, bool activeOnly, CancellationToken token);
    Task<long> ActiveCountAsync(string studentId, CancellationToken token);
    Task<Issuance> IssueAsync(Issuance issuance, int activeLimit, CancellationToken token);
    Task<Issuance> ReturnAsync(string collegeId, string issuanceId, string actorId, string key, CancellationToken token);
    Task<Issuance> RenewAsync(string collegeId, string issuanceId, string actorId, string key, int loanDays, CancellationToken token);
    Task<IReadOnlyList<Issuance>> ListIssuancesAsync(string collegeId, string? status, string? studentId, CancellationToken token);
    Task<Reservation> ReserveAsync(Reservation reservation, CancellationToken token);
    Task CancelReservationAsync(string collegeId, string reservationId, CancellationToken token);
    Task<IReadOnlyList<Reservation>> ReservationsAsync(string collegeId, string? studentId, string? bookId, string? status, CancellationToken token);
    Task<Fine> RecordFineAsync(Fine fine, CancellationToken token);
    Task<IReadOnlyList<Fine>> FinesAsync(string collegeId, string? studentId, CancellationToken token);
    Task<Fine> UpdateFineAsync(string collegeId, string fineId, decimal paid, decimal waived, CancellationToken token);
    Task AddAuditAsync(LibraryAudit audit, CancellationToken token);
}

public sealed class MongoCirculationRepository : ICirculationRepository
{
    private readonly LmsMongoContext _db;
    public MongoCirculationRepository(LmsMongoContext db) => _db = db;

    public async Task<LibrarySettings> GetSettingsAsync(string collegeId, CancellationToken token)
    {
        var settings = await _db.Settings.Find(x => x.CollegeId == collegeId).FirstOrDefaultAsync(token);
        if (settings != null) return settings;
        settings = new LibrarySettings { CollegeId = collegeId };
        try { await _db.Settings.InsertOneAsync(settings, cancellationToken: token); }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey) { settings = await _db.Settings.Find(x => x.CollegeId == collegeId).FirstAsync(token); }
        return settings;
    }

    public async Task<LibrarySettings> SaveSettingsAsync(LibrarySettings settings, CancellationToken token)
    {
        settings.UpdatedAt = DateTime.UtcNow;
        await _db.Settings.ReplaceOneAsync(x => x.CollegeId == settings.CollegeId, settings, new ReplaceOptions { IsUpsert = true }, token);
        return settings;
    }

    public async Task<IReadOnlyList<Issuance>> StudentIssuedAsync(string studentId, bool activeOnly, CancellationToken token)
    {
        var filter = Builders<Issuance>.Filter.Eq(x => x.StudentId, studentId);
        if (activeOnly) filter &= Builders<Issuance>.Filter.Eq(x => x.Status, "active");
        return await _db.Issuances.Find(filter).SortBy(x => x.DueDate).ToListAsync(token);
    }

    public Task<long> ActiveCountAsync(string studentId, CancellationToken token) => _db.Issuances.CountDocumentsAsync(x => x.StudentId == studentId && x.Status == "active", cancellationToken: token);

    public async Task<Issuance> IssueAsync(Issuance issuance, int activeLimit, CancellationToken token)
    {
        var existing = await _db.Issuances.Find(x => x.IssueIdempotencyKey == issuance.IssueIdempotencyKey).FirstOrDefaultAsync(token);
        if (existing != null) return existing;
        for (var attempt = 0; attempt <= activeLimit; attempt++)
        {
            using var session = await _db.Client.StartSessionAsync(cancellationToken: token);
            session.StartTransaction();
            try
            {
                var occupied = await _db.Issuances.Find(session, x => x.StudentId == issuance.StudentId && x.Status == "active" && x.ActiveSlot != null).Project(x => x.ActiveSlot!.Value).ToListAsync(token);
                var slot = Enumerable.Range(1, activeLimit).FirstOrDefault(x => !occupied.Contains(x));
                if (slot == 0) throw new InvalidOperationException($"Student has reached the active issue limit of {activeLimit}.");
                var book = await _db.Books.FindOneAndUpdateAsync<Book, Book>(session,
                    x => x.Id == issuance.BookId && x.CollegeId == issuance.CollegeId && x.AvailableCopies > 0 && x.IsActive,
                    Builders<Book>.Update.Inc(x => x.AvailableCopies, -1).Inc(x => x.BorrowCount, 1).Set(x => x.UpdatedAt, DateTime.UtcNow),
                    new FindOneAndUpdateOptions<Book, Book> { ReturnDocument = ReturnDocument.After }, token)
                    ?? throw new InvalidOperationException("No copy is available.");
                issuance.BookTitle = book.Title; issuance.ActiveSlot = slot;
                await _db.Issuances.InsertOneAsync(session, issuance, cancellationToken: token);
                await session.CommitTransactionAsync(token);
                return issuance;
            }
            catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                await session.AbortTransactionAsync(token);
                existing = await _db.Issuances.Find(x => x.IssueIdempotencyKey == issuance.IssueIdempotencyKey).FirstOrDefaultAsync(token);
                if (existing != null) return existing;
            }
            catch { await session.AbortTransactionAsync(token); throw; }
        }
        throw new InvalidOperationException($"Student has reached the active issue limit of {activeLimit}.");
    }

    public async Task<Issuance> ReturnAsync(string collegeId, string issuanceId, string actorId, string key, CancellationToken token)
    {
        var repeated = await _db.Issuances.Find(x => x.Id == issuanceId && x.ReturnIdempotencyKey == key).FirstOrDefaultAsync(token);
        if (repeated != null) return repeated;
        using var session = await _db.Client.StartSessionAsync(cancellationToken: token); session.StartTransaction();
        try
        {
            var issuance = await _db.Issuances.FindOneAndUpdateAsync<Issuance, Issuance>(session,
                x => x.Id == issuanceId && x.CollegeId == collegeId && x.Status == "active",
                Builders<Issuance>.Update.Set(x => x.Status, "returned").Set(x => x.ActiveSlot, null).Set(x => x.ReturnedAt, DateTime.UtcNow).Set(x => x.ReturnedBy, actorId).Set(x => x.ReturnIdempotencyKey, key).Set(x => x.UpdatedAt, DateTime.UtcNow),
                new FindOneAndUpdateOptions<Issuance, Issuance> { ReturnDocument = ReturnDocument.After }, token)
                ?? throw new KeyNotFoundException("Active issuance not found.");
            await _db.Books.UpdateOneAsync(session, x => x.Id == issuance.BookId, Builders<Book>.Update.Inc(x => x.AvailableCopies, 1).Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);
            await session.CommitTransactionAsync(token); return issuance;
        }
        catch { await session.AbortTransactionAsync(token); throw; }
    }

    public async Task<Issuance> RenewAsync(string collegeId, string issuanceId, string actorId, string key, int loanDays, CancellationToken token)
    {
        var result = await _db.Issuances.FindOneAndUpdateAsync(
            x => x.Id == issuanceId && x.CollegeId == collegeId && x.Status == "active" && x.RenewalCount < 1 && x.LastRenewalKey != key,
            Builders<Issuance>.Update.Inc(x => x.RenewalCount, 1).Set(x => x.DueDate, DateTime.UtcNow.Date.AddDays(loanDays)).Set(x => x.LastRenewalKey, key).Set(x => x.UpdatedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<Issuance> { ReturnDocument = ReturnDocument.After }, token);
        if (result != null) return result;
        return await _db.Issuances.Find(x => x.Id == issuanceId && x.LastRenewalKey == key).FirstOrDefaultAsync(token) ?? throw new InvalidOperationException("Issuance cannot be renewed.");
    }

    public async Task<IReadOnlyList<Issuance>> ListIssuancesAsync(string collegeId, string? status, string? studentId, CancellationToken token)
    {
        var filter = Builders<Issuance>.Filter.Eq(x => x.CollegeId, collegeId);
        if (!string.IsNullOrEmpty(status)) filter &= Builders<Issuance>.Filter.Eq(x => x.Status, status);
        if (!string.IsNullOrEmpty(studentId)) filter &= Builders<Issuance>.Filter.Eq(x => x.StudentId, studentId);
        return await _db.Issuances.Find(filter).SortByDescending(x => x.IssueDate).Limit(500).ToListAsync(token);
    }

    public async Task<Reservation> ReserveAsync(Reservation reservation, CancellationToken token)
    {
        var existing = await _db.Reservations.Find(x => x.IdempotencyKey == reservation.IdempotencyKey).FirstOrDefaultAsync(token);
        if (existing != null) return existing;
        if (await _db.Reservations.Find(x => x.StudentId == reservation.StudentId && x.BookId == reservation.BookId && (x.Status == "queued" || x.Status == "ready")).AnyAsync(token))
            throw new InvalidOperationException("An active reservation already exists.");
        await _db.Reservations.InsertOneAsync(reservation, cancellationToken: token); return reservation;
    }

    public async Task CancelReservationAsync(string collegeId, string reservationId, CancellationToken token)
    {
        var result = await _db.Reservations.UpdateOneAsync(x => x.Id == reservationId && x.CollegeId == collegeId && (x.Status == "queued" || x.Status == "ready"),
            Builders<Reservation>.Update.Set(x => x.Status, "cancelled").Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);
        if (result.ModifiedCount == 0) throw new KeyNotFoundException("Reservation not found.");
    }

    public async Task<IReadOnlyList<Reservation>> ReservationsAsync(string collegeId, string? studentId, string? bookId, string? status, CancellationToken token)
    {
        var filter = Builders<Reservation>.Filter.Eq(x => x.CollegeId, collegeId);
        if (!string.IsNullOrEmpty(studentId)) filter &= Builders<Reservation>.Filter.Eq(x => x.StudentId, studentId);
        if (!string.IsNullOrEmpty(bookId)) filter &= Builders<Reservation>.Filter.Eq(x => x.BookId, bookId);
        if (!string.IsNullOrEmpty(status)) filter &= Builders<Reservation>.Filter.Eq(x => x.Status, status);
        return await _db.Reservations.Find(filter).SortBy(x => x.CreatedAt).ToListAsync(token);
    }

    public async Task<Fine> RecordFineAsync(Fine fine, CancellationToken token)
    {
        await _db.Fines.ReplaceOneAsync(x => x.IssuanceId == fine.IssuanceId, fine, new ReplaceOptions { IsUpsert = true }, token); return fine;
    }
    public async Task<IReadOnlyList<Fine>> FinesAsync(string collegeId, string? studentId, CancellationToken token)
    {
        var filter = Builders<Fine>.Filter.Eq(x => x.CollegeId, collegeId); if (!string.IsNullOrEmpty(studentId)) filter &= Builders<Fine>.Filter.Eq(x => x.StudentId, studentId);
        return await _db.Fines.Find(filter).SortByDescending(x => x.UpdatedAt).ToListAsync(token);
    }
    public async Task<Fine> UpdateFineAsync(string collegeId, string fineId, decimal paid, decimal waived, CancellationToken token)
    {
        var fine = await _db.Fines.Find(x => x.Id == fineId && x.CollegeId == collegeId).FirstOrDefaultAsync(token) ?? throw new KeyNotFoundException("Fine not found.");
        fine.PaidAmount = Math.Clamp(fine.PaidAmount + paid, 0, fine.Amount); fine.WaivedAmount = Math.Clamp(fine.WaivedAmount + waived, 0, fine.Amount - fine.PaidAmount);
        fine.Status = fine.PaidAmount + fine.WaivedAmount >= fine.Amount ? "settled" : fine.PaidAmount > 0 || fine.WaivedAmount > 0 ? "partial" : "unpaid"; fine.UpdatedAt = DateTime.UtcNow;
        await _db.Fines.ReplaceOneAsync(x => x.Id == fine.Id, fine, cancellationToken: token); return fine;
    }
    public Task AddAuditAsync(LibraryAudit audit, CancellationToken token) => _db.Audits.InsertOneAsync(audit, cancellationToken: token);
}
