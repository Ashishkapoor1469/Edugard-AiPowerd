namespace EduGuard.Services;

public static class LibrarianPasswordPolicy
{
    public const string Message = "Password must be at least 10 characters and include uppercase, lowercase, number, and special character.";

    public static bool IsStrong(string password) =>
        password.Length >= 10 && password.Any(char.IsUpper) && password.Any(char.IsLower) &&
        password.Any(char.IsDigit) && password.Any(c => !char.IsLetterOrDigit(c));

    public static void SelfCheck()
    {
        if (!IsStrong("Library1!x") || IsStrong("libraryonly"))
            throw new InvalidOperationException("Librarian password policy self-check failed.");
    }
}
