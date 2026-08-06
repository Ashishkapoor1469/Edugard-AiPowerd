using System;
using System.IO;
using System.Net;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http;
using StackExchange.Redis;
using EduGuard.Hubs;
using EduGuard.Services;

// Force TLS 1.2/1.3 at the runtime level to fix Windows SChannel errors
ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;

var builder = WebApplication.CreateBuilder(args);
LibrarianPasswordPolicy.SelfCheck();

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Configure Port
var port = builder.Configuration.GetValue<string>("PORT") ?? "5000";
builder.WebHost.UseUrls($"http://*:{port}");

// Add services to the container.
builder.Services.AddControllers();
builder.Services
    .AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "obj", "DataProtectionKeys")))
    .SetApplicationName("EduGuardBackend");

// Configure cache
builder.Services.AddMemoryCache();
var redisUrl = builder.Configuration.GetValue<string>("REDIS_URL");
if (!string.IsNullOrWhiteSpace(redisUrl))
{
    Console.WriteLine("[CACHE] Redis distributed cache enabled");
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.ConfigurationOptions = CreateRedisOptions(redisUrl);
        options.InstanceName = "eduguard:";
    });
}
else
{
    Console.WriteLine("[CACHE] In-memory distributed cache enabled");
    builder.Services.AddDistributedMemoryCache();
}

// Configure Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("api-limiter", opt =>
    {
        opt.PermitLimit = 100; // Allow 100 requests per window
        opt.Window = TimeSpan.FromMinutes(1); // 1-minute window
        opt.QueueLimit = 0;
    });
    options.AddPolicy("attendance-writes", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirst("id")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 4,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    options.AddPolicy("attendance-refresh", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirst("id")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
    options.AddPolicy("attendance-finalize", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirst("id")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromMinutes(20), QueueLimit = 0 }));
    options.AddPolicy("data-fetch", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"{context.User.FindFirst("id")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous"}:{context.Request.Path}",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("dashboard-fetch", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"{context.User.FindFirst("id")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous"}:{context.Request.Path}",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
});

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .SetIsOriginAllowed(_ => true) // allows any origin in development
              .AllowCredentials(); // Required for SignalR
    });
});

// Configure MongoDB Service
builder.Services.AddSingleton<MongoService>();

// Configure Business & Utility Services
builder.Services.AddTransient<ExcelParserService>();
builder.Services.AddHttpClient("nvidia-nim", client => client.Timeout = TimeSpan.FromSeconds(45));
builder.Services.AddSingleton<INvidiaNimService, NvidiaNimService>();
builder.Services.AddTransient<NotificationService>();
builder.Services.AddSingleton<ICacheService, CacheService>();
builder.Services.AddHttpClient<ILibraryService, HttpLibraryService>(client => client.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddScoped<IPushAudienceNotifier, PushAudienceNotifier>();
builder.Services.AddHttpClient<FirebasePushNotificationSender>(client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSingleton<IPushNotificationSender>(sp => sp.GetRequiredService<FirebasePushNotificationSender>());
builder.Services.AddSingleton<PushNotificationQueue>();
builder.Services.AddSingleton<IPushNotificationQueue>(sp => sp.GetRequiredService<PushNotificationQueue>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<PushNotificationQueue>());

// Configure Email Queue Service as a Hosted background service
builder.Services.AddSingleton<EmailQueueService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<EmailQueueService>());
builder.Services.AddHostedService<ReportQueueWorker>();
builder.Services.AddSingleton<BadgeAwardWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<BadgeAwardWorker>());

// Configure JWT Authentication
var jwtSecret = builder.Configuration.GetValue<string>("JWT_SECRET") ?? throw new InvalidOperationException("JWT_SECRET is required.");
var key = SHA256.HashData(Encoding.UTF8.GetBytes(jwtSecret));

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = false,
        ValidateAudience = false,
        ClockSkew = TimeSpan.Zero
    };

    // Configure JWT extraction during SignalR handshake
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/eduguardHub"))
            {
                context.Token = accessToken;
            }
            else if (!context.Request.Headers.ContainsKey("Authorization") && context.Request.Cookies.TryGetValue("access_token", out var cookieToken))
            {
                context.Token = cookieToken;
            }
            return Task.CompletedTask;
        }
    };
});

var app = builder.Build();

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
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
        message = status == 500 ? "Unexpected EduGuard server error." : error?.Message ?? "An error occurred.",
        traceId = context.TraceIdentifier
    });
}));

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}


app.UseCors("AllowAll");

app.UseStaticFiles(); // Serve wwwroot/ (report cards, etc.)

app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

var controllers = app.MapControllers();
controllers.Add(endpoint =>
{
    var isGet = endpoint.Metadata.OfType<HttpMethodMetadata>().Any(metadata => metadata.HttpMethods.Contains("GET"));
    if (isGet && !endpoint.Metadata.OfType<EnableRateLimitingAttribute>().Any())
        endpoint.Metadata.Add(new EnableRateLimitingAttribute("data-fetch"));
});
app.MapGet("/health", () => Results.Ok(new { status = "ok", commit = Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") }));
app.MapHub<EduGuardHub>("/eduguardHub");

app.Run();

static ConfigurationOptions CreateRedisOptions(string redisUrl)
{
    if (!Uri.TryCreate(redisUrl, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host))
    {
        return ConfigurationOptions.Parse(redisUrl);
    }

    var options = new ConfigurationOptions
    {
        AbortOnConnectFail = false,
        Ssl = uri.Scheme == "rediss"
    };
    options.EndPoints.Add(uri.Host, uri.Port > 0 ? uri.Port : 6379);

    var userInfo = Uri.UnescapeDataString(uri.UserInfo ?? "");
    var parts = userInfo.Split(':', 2);
    if (parts.Length == 2)
    {
        options.User = parts[0];
        options.Password = parts[1];
    }
    else if (parts.Length == 1 && !string.IsNullOrEmpty(parts[0]))
    {
        options.Password = parts[0];
    }

    return options;
}
