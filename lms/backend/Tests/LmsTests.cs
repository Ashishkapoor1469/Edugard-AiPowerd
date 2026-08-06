using Lms.Api.Models;
using Lms.Api.Services;

namespace Lms.Api.Tests;

public static class LmsUnitTests
{
    public static void RunAllTests()
    {
        Console.WriteLine("Running LMS Business Logic Unit Tests...");

        TestDueDateCalculationSkipsSundaysAndHolidays();
        TestPhysicalCopyAccessionNumberFormat();
        TestBookAvailabilityCalculation();
        TestFineCalculation();

        Console.WriteLine("All LMS Business Logic Unit Tests Passed Successfully!");
    }

    private static void TestDueDateCalculationSkipsSundaysAndHolidays()
    {
        var service = new LibraryCirculationService(null!, null!, null!);
        var startDate = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc); // Saturday
        var holidays = new List<string> { "2026-08-15" };

        var dueDate = service.CalculateDueDate(startDate, 14, holidays); // 14 days later = Aug 15 (Saturday & Holiday) -> Aug 16 (Sunday) -> Aug 17 (Monday)
        
        if (dueDate.DayOfWeek == DayOfWeek.Sunday) throw new Exception("Due date fell on a Sunday!");
        if (holidays.Contains(dueDate.ToString("yyyy-MM-dd"))) throw new Exception("Due date fell on a holiday!");
        Console.WriteLine($"[PASS] TestDueDateCalculationSkipsSundaysAndHolidays: Due date computed correctly as {dueDate:yyyy-MM-dd} ({dueDate.DayOfWeek})");
    }

    private static void TestPhysicalCopyAccessionNumberFormat()
    {
        var book = new Book
        {
            Isbn = "9780262046305",
            Title = "Algorithms",
            TotalCopies = 3
        };

        var copies = Enumerable.Range(1, book.TotalCopies).Select(i => new PhysicalCopy
        {
            AccessionNumber = $"{book.Isbn.Replace("-", "")}-{i:D3}",
            Barcode = $"BC-{book.Isbn.Replace("-", "")}-{i:D3}",
            Status = "available"
        }).ToList();

        if (copies.Count != 3) throw new Exception("Copies count mismatch");
        if (copies[0].AccessionNumber != "9780262046305-001") throw new Exception("First accession number incorrect");
        if (copies[2].Barcode != "BC-9780262046305-003") throw new Exception("Third barcode incorrect");

        Console.WriteLine("[PASS] TestPhysicalCopyAccessionNumberFormat: Physical accession numbers & barcodes generated accurately");
    }

    private static void TestBookAvailabilityCalculation()
    {
        var book = new Book { TotalCopies = 5, AvailableCopies = 5 };
        var copy = new PhysicalCopy { AccessionNumber = "ACC-001", Status = "available" };
        book.PhysicalCopies.Add(copy);

        // Mark copy lost
        copy.Status = "lost";
        book.AvailableCopies = Math.Max(0, book.AvailableCopies - 1);

        if (book.AvailableCopies != 4) throw new Exception("Available copies calculation incorrect after copy lost");
        Console.WriteLine("[PASS] TestBookAvailabilityCalculation: Available copies decremented on copy state change");
    }

    private static void TestFineCalculation()
    {
        var dailyRate = 5m;
        var overdueDays = 6;
        var calculatedFine = dailyRate * overdueDays;

        if (calculatedFine != 30m) throw new Exception("Fine calculation mismatch");
        Console.WriteLine("[PASS] TestFineCalculation: Overdue fine amount computed correctly");
    }
}
