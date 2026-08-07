using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EduGuard.Services
{
    public class EmailJob
    {
        public string Email { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
        public string Purpose { get; set; } = "verification";
        public int Retries { get; set; } = 0;
    }

    public class EmailQueueService : BackgroundService
    {
        private readonly Channel<EmailJob> _queue;
        private readonly HttpClient _httpClient;
        private readonly ILogger<EmailQueueService> _logger;
        private readonly string _resendApiKey;
        private readonly string _frontendUrl;
        private readonly IReadOnlyDictionary<string, string> _senders;
        private readonly bool _hasKey;
        private const int MaxRetries = 3;
        private const int DelayBetweenEmailsMs = 500;

        public EmailQueueService(IConfiguration configuration, ILogger<EmailQueueService> logger)
        {
            _logger = logger;
            _queue = Channel.CreateUnbounded<EmailJob>();
            _httpClient = new HttpClient();
            
            _resendApiKey = configuration.GetValue<string>("RESEND_API_KEY") ?? string.Empty;
            _frontendUrl = (configuration.GetValue<string>("FRONTEND_URL") ?? "http://localhost:5173").TrimEnd('/');
            _senders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["verification"] = configuration.GetValue<string>("EMAIL_FROM_VERIFICATION") ?? "EduGuard <verify@ashishzu.in>",
                ["security"] = configuration.GetValue<string>("EMAIL_FROM_SECURITY") ?? "EduGuard Security <security@ashishzu.in>",
                ["notifications"] = configuration.GetValue<string>("EMAIL_FROM_NOTIFICATIONS") ?? "EduGuard <notifications@ashishzu.in>",
                ["system"] = configuration.GetValue<string>("EMAIL_FROM_SYSTEM") ?? "EduGuard <noreply@ashishzu.in>",
                ["support"] = configuration.GetValue<string>("EMAIL_FROM_SUPPORT") ?? "EduGuard Support <support@ashishzu.in>"
            };
            _hasKey = !string.IsNullOrEmpty(_resendApiKey) && _resendApiKey != "your_resend_api_key";

            if (!_hasKey)
            {
                _logger.LogWarning("[WARNING] RESEND_API_KEY is not defined. Falling back to console-logged verification emails.");
            }
        }

        public void QueueEmail(string email, string token, string purpose = "verification")
        {
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(token)) return;

            var normalizedPurpose = _senders.ContainsKey(purpose) ? purpose : "verification";
            var job = new EmailJob { Email = email, Token = token, Purpose = normalizedPurpose };
            _queue.Writer.TryWrite(job);
            _logger.LogInformation($"[EMAIL QUEUE] Job added to queue for: {email}");
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[EMAIL QUEUE] Background worker started.");

            while (await _queue.Reader.WaitToReadAsync(stoppingToken))
            {
                while (_queue.Reader.TryRead(out var job))
                {
                    _logger.LogInformation($"[EMAIL QUEUE] Processing verification email for: {job.Email} (Attempt {job.Retries + 1})");

                    try
                    {
                        await SendEmailInternalAsync(job);
                        _logger.LogInformation($"[EMAIL QUEUE] Successfully processed email for: {job.Email}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"[EMAIL QUEUE] Error sending email to {job.Email}.");

                        if (job.Retries < MaxRetries - 1)
                        {
                            job.Retries++;
                            // Re-queue
                            _queue.Writer.TryWrite(job);
                            _logger.LogInformation($"[EMAIL QUEUE] Re-queued job for: {job.Email} (Retries left: {MaxRetries - job.Retries})");
                        }
                        else
                        {
                            _logger.LogError($"[EMAIL QUEUE] Critical: Email to {job.Email} failed after {MaxRetries} attempts. Job discarded.");
                        }
                    }

                    // Delay between emails
                    await Task.Delay(DelayBetweenEmailsMs, stoppingToken);
                }
            }

            _logger.LogInformation("[EMAIL QUEUE] Background worker stopped.");
        }

        private async Task SendEmailInternalAsync(EmailJob job)
        {
            var verificationLink = $"{_frontendUrl}/verify?token={job.Token}&email={Uri.EscapeDataString(job.Email)}";
            var isSecurityMessage = string.Equals(job.Purpose, "security", StringComparison.OrdinalIgnoreCase);
            var subject = isSecurityMessage ? "Your EduGuard security code" : "Verify your EduGuard Account";
            var html = isSecurityMessage
                ? $@"
                        <div style=""font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #f0f0f0; border-radius: 8px;"">
                            <h2 style=""color: #4f46e5; margin-bottom: 20px;"">EduGuard Security</h2>
                            <p>{WebUtility.HtmlEncode(job.Token)}</p>
                            <p style=""color: #64748b; font-size: 12px; margin-top: 30px;"">If you did not request this code, you can safely ignore this email.</p>
                        </div>"
                : $@"
                        <div style=""font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #f0f0f0; border-radius: 8px;"">
                            <h2 style=""color: #4f46e5; margin-bottom: 20px;"">Welcome to EduGuard</h2>
                            <p>Your college mentor has added you to the EduGuard Student Risk & Performance Management Portal.</p>
                            <p>Please click the button below to verify your email, set a secure password, and activate your account:</p>
                            <div style=""margin: 30px 0; text-align: center;"">
                                <a href=""{verificationLink}"" style=""background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;"">
                                    Verify & Activate Account
                                </a>
                            </div>
                            <p style=""color: #64748b; font-size: 12px; margin-top: 30px;"">
                                If the button doesn't work, copy and paste the link below into your browser: <br/>
                                <a href=""{verificationLink}"">{verificationLink}</a>
                            </p>
                        </div>";

            if (_hasKey)
            {
                var requestMessage = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
                requestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _resendApiKey);

                var payload = new
                {
                    from = _senders[job.Purpose],
                    reply_to = _senders["support"],
                    to = job.Email,
                    subject,
                    html
                };

                requestMessage.Content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.SendAsync(requestMessage);
                if (!response.IsSuccessStatusCode)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Resend API returned non-success code: {response.StatusCode}. Details: {responseBody}");
                }
                _logger.LogInformation($"[EMAIL SENT] {job.Purpose} email successfully sent to {job.Email} via Resend.");
            }
            else
            {
                LogMockEmail(job.Email, subject, isSecurityMessage ? job.Token : verificationLink);
            }
        }

        private void LogMockEmail(string email, string subject, string content)
        {
            var sb = new StringBuilder();
            sb.AppendLine("\n==================================================");
            sb.AppendLine($"[MOCK EMAIL SERVICE] To: {email}");
            sb.AppendLine($"Subject: {subject}");
            sb.AppendLine("--------------------------------------------------");
            sb.AppendLine("Please click the link below to verify your account:");
            sb.AppendLine(content);
            sb.AppendLine("==================================================\n");
            
            Console.WriteLine(sb.ToString());
        }
    }
}
