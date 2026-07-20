namespace EduGuard.Services
{
    public static class AttendanceRules
    {
        public static string? CurrentSession(DateTime localTime)
        {
            var time = localTime.TimeOfDay;
            if (time >= TimeSpan.FromHours(10) && time < TimeSpan.FromHours(12)) return "morning";
            if (time >= TimeSpan.FromHours(12) && time < TimeSpan.FromHours(15)) return "afternoon";
            return null;
        }

        public static DateTime CollegeNow(string timeZone)
        {
            foreach (var id in new[] { timeZone, "Asia/Kolkata", "India Standard Time" }.Distinct())
            {
                try { return TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, id); }
                catch (TimeZoneNotFoundException) { }
                catch (InvalidTimeZoneException) { }
            }
            return DateTime.UtcNow;
        }
    }
}
