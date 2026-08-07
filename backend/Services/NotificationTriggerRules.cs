using EduGuard.Models;

namespace EduGuard.Services;

public sealed record NotificationTrigger(string Type, string Message, string Priority, string? PushTitle = null);

public interface INotificationTriggerRule
{
    IEnumerable<NotificationTrigger> Evaluate(Student student, Student? previous);
}

public sealed class AttendanceNotificationRule : INotificationTriggerRule
{
    public IEnumerable<NotificationTrigger> Evaluate(Student student, Student? previous)
    {
        if (student.Attendance is not { } attendance || attendance >= 75) yield break;
        if (previous?.Attendance is { } oldAttendance && oldAttendance < 75) yield break;
        yield return new("attendance_drop", $"Student {student.Name}'s attendance has dropped to {attendance:F1}% (below 75%).", "high");
    }
}

public sealed class MarksNotificationRule : INotificationTriggerRule
{
    public IEnumerable<NotificationTrigger> Evaluate(Student student, Student? previous)
    {
        foreach (var mark in student.Marks ?? [])
        {
            var average = RiskEngine.CalculateSubjectAverage(mark);
            if (average is not { } value || value >= 35) continue;
            var oldMark = previous?.Marks?.FirstOrDefault(x => string.Equals(x.SubjectName, mark.SubjectName, StringComparison.OrdinalIgnoreCase));
            var oldAverage = oldMark == null ? null : RiskEngine.CalculateSubjectAverage(oldMark);
            if (oldAverage is { } oldValue && oldValue < 35) continue;
            yield return new("marks_drop", $"Student {student.Name} is failing in subject: {mark.SubjectName} (score: {value:F1}%).", "medium");
        }

        var currentOverall = OverallAverage(student.Marks);
        var oldOverall = OverallAverage(previous?.Marks);
        if (currentOverall is { } current && current < 50 && (oldOverall is null || oldOverall >= 50))
            yield return new("marks_drop", $"Student {student.Name}'s overall academic average has dropped below 50% (currently {current:F1}%).", "high");
    }

    private static double? OverallAverage(IEnumerable<SubjectMarks>? marks)
    {
        var averages = marks?.Select(RiskEngine.CalculateSubjectAverage).Where(x => x.HasValue).Select(x => x!.Value).ToList() ?? [];
        return averages.Count == 0 ? null : averages.Average();
    }
}

public sealed class BehaviorNotificationRule : INotificationTriggerRule
{
    public IEnumerable<NotificationTrigger> Evaluate(Student student, Student? previous)
    {
        if (!string.Equals(student.Behavior, "bad", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(previous?.Behavior, "bad", StringComparison.OrdinalIgnoreCase)) yield break;
        yield return new("behavior_change", $"Student {student.Name}'s conduct/behavior has been flagged as bad.", "medium");
    }
}

public sealed class RiskLevelNotificationRule : INotificationTriggerRule
{
    public IEnumerable<NotificationTrigger> Evaluate(Student student, Student? previous)
    {
        if (string.Equals(student.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(previous?.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase))
        {
            yield return new("critical_alert", $"CRITICAL ALERT: Student {student.Name} is at CRITICAL RISK level (score: {student.RiskScore}/100). Immediate action required.", "urgent", "Critical risk alert");
            yield break;
        }

        if (string.Equals(student.RiskLevel, "high", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(previous?.RiskLevel, "high", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(previous?.RiskLevel, "critical", StringComparison.OrdinalIgnoreCase))
            yield return new("high_risk", $"Student {student.Name} has risen to HIGH RISK level (score: {student.RiskScore}/100).", "high", "High risk alert");
    }
}
