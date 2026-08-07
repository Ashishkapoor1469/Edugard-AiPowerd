using System.Text.RegularExpressions;

namespace EduGuard.Services;

public sealed record BadgeClassification(string BadgeId, string Type, string Color, string Category);

public interface IBadgeCatalog
{
    BadgeClassification ClassifyContribution(string contribution);
    bool IsAllowedBadge(string value);
    bool IsAllowedCategory(string value);
    bool IsAllowedLevel(string value);
}

public sealed class BadgeCatalog : IBadgeCatalog
{
    private static readonly HashSet<string> Badges = new(StringComparer.OrdinalIgnoreCase)
    {
        "class-representative", "participation", "competition-winner", "runner-up", "nss-volunteer",
        "community-service", "sports-achievement", "cultural-performer", "debate-champion", "coding-champion",
        "academic-excellence", "event-coordinator", "attendance-excellence", "team-leader", "innovation-award"
    };
    private static readonly HashSet<string> Categories = new(StringComparer.OrdinalIgnoreCase) { "leadership", "academic", "sports", "cultural", "service", "technical", "participation" };
    private static readonly HashSet<string> Levels = new(StringComparer.OrdinalIgnoreCase) { "college", "university", "state", "national" };
    private static readonly (Func<string, bool> Matches, BadgeClassification Result)[] Rules =
    {
        (text => ContainsAny(text, "winner", "award", "rank"), new("competition-winner", "achievement", "amber", "participation")),
        (text => ContainsAny(text, "sport", "athletic", "game"), new("sports-achievement", "sports", "emerald", "sports")),
        (text => ContainsAny(text, "volunteer", "service", "social"), new("community-service", "service", "sky", "service")),
        (text => ContainsAny(text, "music", "dance", "cultural") || Regex.IsMatch(text, @"\bart\b"), new("cultural-performer", "culture", "violet", "cultural"))
    };
    private static readonly BadgeClassification Fallback = new("participation", "co-curricular", "teal", "participation");

    public BadgeClassification ClassifyContribution(string contribution)
    {
        var text = contribution.ToLowerInvariant();
        foreach (var rule in Rules)
        {
            if (rule.Matches(text)) return rule.Result;
        }

        return Fallback;
    }

    public bool IsAllowedBadge(string value) => Badges.Contains(value);
    public bool IsAllowedCategory(string value) => Categories.Contains(value);
    public bool IsAllowedLevel(string value) => Levels.Contains(value);
    private static bool ContainsAny(string value, params string[] terms) => terms.Any(value.Contains);
}
