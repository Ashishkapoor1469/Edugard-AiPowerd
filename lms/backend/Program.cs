using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Lms.Api.Data;
using Lms.Api.Services;
using Lms.Api.Workers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://*:{builder.Configuration["PORT"] ?? "5100"}");
builder.Services.AddControllers();
builder.Services.AddCors(x => x.AddDefaultPolicy(policy => policy.WithOrigins(builder.Configuration["LMS_FRONTEND_URL"] ?? "http://localhost:5174").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var redisUrl = builder.Configuration["REDIS_URL"];
if (string.IsNullOrWhiteSpace(redisUrl)) builder.Services.AddDistributedMemoryCache();
else builder.Services.AddStackExchangeRedisCache(x => { x.ConfigurationOptions = CreateRedisOptions(redisUrl); x.InstanceName = "eduguard:lms:"; });

var jwtKey = SHA256.HashData(Encoding.UTF8.GetBytes(builder.Configuration["LMS_JWT_SECRET"] ?? throw new InvalidOperationException("LMS_JWT_SECRET is required.")));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(x => x.TokenValidationParameters = new()
{
    ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(jwtKey), ValidateIssuer = true, ValidIssuer = "eduguard-lms",
    ValidateAudience = true, ValidAudience = "eduguard-lms-api", ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30), RoleClaimType = ClaimTypes.Role
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(x =>
{
    x.RejectionStatusCode = 429;
    x.AddPolicy("catalog", context => RateLimitPartition.GetFixedWindowLimiter(context.User.FindFirst("id")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous", _ => new() { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddSingleton<LmsMongoContext>();
builder.Services.AddSingleton<IBookRepository, MongoBookRepository>();
builder.Services.AddSingleton<ICirculationRepository, MongoCirculationRepository>();
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<ILibraryCirculationService, LibraryCirculationService>();
builder.Services.AddHttpClient<IEduGuardClient, EduGuardClient>(x => x.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddHostedService<LibraryDailyWorker>();

var app = builder.Build();
app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var (status, code) = error switch
    {
        UnauthorizedAccessException => (403, "FORBIDDEN"),
        KeyNotFoundException => (404, "NOT_FOUND"),
        ArgumentException => (400, "BAD_REQUEST"),
        InvalidOperationException => (409, "CONFLICT"),
        _ => (500, "INTERNAL_SERVER_ERROR")
    };
    context.Response.StatusCode = status;
    context.Response.ContentType = "application/json";
    await context.Response.WriteAsJsonAsync(new
    {
        success = false,
        code = code,
        message = status == 500 ? "Unexpected LMS server error." : error?.Message ?? "An error occurred.",
        traceId = context.TraceIdentifier
    });
}));

app.UseCors(); app.UseAuthentication(); app.UseRateLimiter(); app.UseAuthorization(); app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "eduguard-lms", commit = Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") }));
await app.Services.GetRequiredService<LmsMongoContext>().EnsureIndexesAsync();
if (app.Configuration.GetValue<bool>("LMS_ENABLE_DEMO_SEED", true))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<LmsMongoContext>();
    await Lms.Api.Seed.DemoDataSeeder.SeedAsync(db);
}
app.Run();


static ConfigurationOptions CreateRedisOptions(string redisUrl)
{
    if (!Uri.TryCreate(redisUrl, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host)) return ConfigurationOptions.Parse(redisUrl);
    var options = new ConfigurationOptions { AbortOnConnectFail = false, Ssl = uri.Scheme == "rediss", ConnectTimeout = 2000, AsyncTimeout = 2000, ConnectRetry = 1 };
    options.EndPoints.Add(uri.Host, uri.Port > 0 ? uri.Port : 6379);
    var credentials = Uri.UnescapeDataString(uri.UserInfo ?? "").Split(':', 2);
    if (credentials.Length == 2) { options.User = credentials[0]; options.Password = credentials[1]; }
    else if (credentials.Length == 1 && !string.IsNullOrEmpty(credentials[0])) options.Password = credentials[0];
    return options;
}
