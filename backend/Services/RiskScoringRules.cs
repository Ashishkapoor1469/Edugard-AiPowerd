namespace EduGuard.Services;

public sealed record RiskEvaluationContext(
    double? AttendancePercentage,
    double? MarksAverage,
    int FailingSubjects,
    string? Behavior,
    bool HasContribution,
    int MissingSubjects);

public interface IRiskScoringRule
{
    double Score(RiskEvaluationContext context);
}

internal sealed class AttendanceRiskRule : IRiskScoringRule
{
    public double Score(RiskEvaluationContext context) => context.AttendancePercentage switch
    {
        < 50 => 40,
        < 75 => 20,
        _ => 0
    };
}

internal sealed class MarksRiskRule : IRiskScoringRule
{
    public double Score(RiskEvaluationContext context) => context.MarksAverage switch
    {
        < 35 => 30,
        < 50 => 15,
        _ => 0
    };
}

internal sealed class FailedSubjectsRiskRule : IRiskScoringRule
{
    public double Score(RiskEvaluationContext context) => Math.Min(context.FailingSubjects * 10, 30);
}

internal sealed class BehaviorRiskRule : IRiskScoringRule
{
    public double Score(RiskEvaluationContext context) => context.Behavior?.ToLowerInvariant() switch
    {
        "bad" => 20,
        "average" => 8,
        _ => 0
    };
}

internal sealed class ContributionRiskRule : IRiskScoringRule
{
    public double Score(RiskEvaluationContext context) => context.HasContribution ? 0 : 5;
}

internal sealed class RecordCompletenessRiskRule : IRiskScoringRule
{
    public double Score(RiskEvaluationContext context) => context.MissingSubjects > 3 ? 5 : 0;
}

public static class RiskRuleFactory
{
    public static IReadOnlyList<IRiskScoringRule> CreateDefault() =>
    [
        new AttendanceRiskRule(),
        new MarksRiskRule(),
        new FailedSubjectsRiskRule(),
        new BehaviorRiskRule(),
        new ContributionRiskRule(),
        new RecordCompletenessRiskRule()
    ];
}
