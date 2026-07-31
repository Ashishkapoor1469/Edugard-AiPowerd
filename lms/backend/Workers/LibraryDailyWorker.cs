using Lms.Api.Data;
using Lms.Api.Models;
using Lms.Api.Services;
using MongoDB.Driver;

namespace Lms.Api.Workers;

public sealed class LibraryDailyWorker : BackgroundService
{
    private readonly LmsMongoContext _db; private readonly ICirculationRepository _repo; private readonly IEduGuardClient _eduguard; private readonly ILogger<LibraryDailyWorker> _logger;
    public LibraryDailyWorker(LmsMongoContext db, ICirculationRepository repo, IEduGuardClient eduguard, ILogger<LibraryDailyWorker> logger) => (_db, _repo, _eduguard, _logger) = (db, repo, eduguard, logger);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "LMS daily processing failed"); }
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    public async Task RunAsync(CancellationToken token)
    {
        var today = DateTime.UtcNow.Date;
        var preferences = (await _db.Preferences.Find(_ => true).ToListAsync(token)).ToDictionary(x => x.LibrarianId);
        bool Allows(string librarianId, string type)
        {
            if (!preferences.TryGetValue(librarianId, out var prefs)) return true;
            return type switch { "fine" => prefs.FineAlerts, "reservation" => prefs.ReservationAlerts, "stock" => prefs.LowStockAlerts, "overdue" => prefs.OverdueDigest != "off", _ => true };
        }
        await _db.Reservations.UpdateManyAsync(x => x.Status == "ready" && x.ExpiresAt < DateTime.UtcNow,
            Builders<Reservation>.Update.Set(x => x.Status, "expired").Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);
        var dueSoon = await _db.Issuances.Find(x => x.Status == "active" && x.DueDate >= today && x.DueDate < today.AddDays(3)).ToListAsync(token);
        foreach (var issuance in dueSoon)
        {
            var days = (issuance.DueDate.Date - today).Days;
            await _eduguard.NotifyAsync(new(issuance.StudentId, $"due-reminder:{issuance.Id}:{today:yyyyMMdd}", days == 0 ? "Library book due today" : "Library book due soon",
                days == 0 ? $"{issuance.BookTitle} is due today. Renew or return it." : $"{issuance.BookTitle} is due in {days} day(s).", "normal",
                new() { ["type"] = "book_due", ["path"] = "/?tab=books", ["issuanceId"] = issuance.Id! }), token);
        }
        var overdue = await _db.Issuances.Find(x => x.Status == "active" && x.DueDate < today).ToListAsync(token);
        foreach (var group in overdue.GroupBy(x => x.CollegeId))
        {
            var settings = await _repo.GetSettingsAsync(group.Key, token);
            var librarians = await _eduguard.ActiveLibrariansAsync(group.Key, token);
            foreach (var issuance in group)
            {
                var days = Math.Max(1, (today - issuance.DueDate.Date).Days);
                var existing = await _db.Fines.Find(x => x.IssuanceId == issuance.Id).FirstOrDefaultAsync(token);
                var fine = existing ?? new Fine { CollegeId = issuance.CollegeId, IssuanceId = issuance.Id!, StudentId = issuance.StudentId, BookTitle = issuance.BookTitle };
                fine.Amount = days * settings.DailyFineRate; fine.CalculatedThrough = today; fine.Status = fine.PaidAmount + fine.WaivedAmount >= fine.Amount ? "settled" : fine.PaidAmount > 0 || fine.WaivedAmount > 0 ? "partial" : "unpaid"; fine.UpdatedAt = DateTime.UtcNow;
                await _repo.RecordFineAsync(fine, token);
                await _eduguard.NotifyAsync(new(issuance.StudentId, $"overdue:{issuance.Id}:{today:yyyyMMdd}", "Library book overdue", $"{issuance.BookTitle} is {days} day(s) overdue.", days >= settings.ImportantOverdueDays ? "important" : "normal", new() { ["type"] = "book_overdue", ["path"] = "/?tab=books", ["issuanceId"] = issuance.Id! }), token);

                if (fine.Amount >= settings.FineAlertThreshold)
                    foreach (var librarian in librarians.Where(x => Allows(x.Id, "fine")))
                        await _eduguard.NotifyAsync(new(librarian.Id, $"fine-threshold:{fine.Id}:{today:yyyyMMdd}", "Library fine threshold reached", $"{issuance.BookTitle}: accrued fine is {fine.Amount:0.00}.", "important", new() { ["type"] = "library_fine", ["path"] = "/library", ["studentId"] = issuance.StudentId }), token);
            }

            foreach (var librarian in librarians.Where(x => Allows(x.Id, "overdue")))
                await _eduguard.NotifyAsync(new(librarian.Id, $"overdue-digest:{group.Key}:{today:yyyyMMdd}", "Daily overdue digest", $"{group.Count()} active issuance(s) are overdue.", group.Any(x => (today - x.DueDate.Date).Days >= settings.ImportantOverdueDays) ? "important" : "normal", new() { ["type"] = "library_overdue_digest", ["path"] = "/library" }), token);
        }

        var queued = await _db.Reservations.Find(x => x.Status == "queued").SortBy(x => x.CreatedAt).ToListAsync(token);
        foreach (var bookGroup in queued.GroupBy(x => new { x.CollegeId, x.BookId }))
        {
            var book = await _db.Books.Find(x => x.Id == bookGroup.Key.BookId && x.AvailableCopies > 0).FirstOrDefaultAsync(token);
            if (book == null) continue;
            var allocated = await _db.Reservations.CountDocumentsAsync(x => x.BookId == book.Id && x.Status == "ready", cancellationToken: token);
            if (allocated >= book.AvailableCopies) continue;
            var reservation = bookGroup.First();
            var claimed = await _db.Reservations.FindOneAndUpdateAsync(x => x.Id == reservation.Id && x.Status == "queued", Builders<Reservation>.Update.Set(x => x.Status, "ready").Set(x => x.ReadyAt, DateTime.UtcNow).Set(x => x.ExpiresAt, DateTime.UtcNow.AddDays(2)).Set(x => x.UpdatedAt, DateTime.UtcNow), new FindOneAndUpdateOptions<Reservation> { ReturnDocument = ReturnDocument.After }, token);
            if (claimed == null) continue;
            await _eduguard.NotifyAsync(new(claimed.StudentId, $"reservation-ready:{claimed.Id}", "Reserved book ready", $"{claimed.BookTitle} is ready for pickup.", "normal", new() { ["type"] = "reservation_ready", ["path"] = "/library", ["reservationId"] = claimed.Id! }), token);
            foreach (var librarian in (await _eduguard.ActiveLibrariansAsync(claimed.CollegeId, token)).Where(x => Allows(x.Id, "reservation")))
                await _eduguard.NotifyAsync(new(librarian.Id, $"reservation-prepare:{claimed.Id}:{librarian.Id}", "Prepare reserved book", $"Prepare {claimed.BookTitle} for pickup.", "normal", new() { ["type"] = "reservation_prepare", ["path"] = "/library", ["reservationId"] = claimed.Id! }), token);
        }

        var unavailable = await _db.Books.Find(x => x.IsActive && x.AvailableCopies == 0).ToListAsync(token);
        foreach (var book in unavailable)
        {
            var settings = await _repo.GetSettingsAsync(book.CollegeId, token);
            var count = await _db.Reservations.CountDocumentsAsync(x => x.BookId == book.Id && x.Status == "queued", cancellationToken: token);
            if (count < settings.HighDemandReservationThreshold) continue;
            foreach (var librarian in (await _eduguard.ActiveLibrariansAsync(book.CollegeId, token)).Where(x => Allows(x.Id, "stock")))
                await _eduguard.NotifyAsync(new(librarian.Id, $"low-stock:{book.Id}:{today:yyyyMMdd}:{librarian.Id}", "High-demand title unavailable", $"{book.Title} has no copies and {count} queued reservations.", "important", new() { ["type"] = "library_low_stock", ["path"] = "/library", ["bookId"] = book.Id! }), token);
        }
    }

}
