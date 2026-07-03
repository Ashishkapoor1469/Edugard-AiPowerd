using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using EduGuard.Models;

namespace EduGuard.Services
{
    public class ReportQueueWorker : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<ReportQueueWorker> _logger;

        public ReportQueueWorker(IServiceProvider serviceProvider, ILogger<ReportQueueWorker> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Report Queue Worker started successfully.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using (var scope = _serviceProvider.CreateScope())
                    {
                        var mongoService = scope.ServiceProvider.GetRequiredService<MongoService>();
                        
                        // Find first pending job
                        var job = await mongoService.ReportCardJobs
                            .Find(j => j.Status == "pending")
                            .SortBy(j => j.CreatedAt)
                            .FirstOrDefaultAsync(stoppingToken);

                        if (job != null)
                        {
                            _logger.LogInformation($"Processing report card generation job: {job.Id} for student: {job.StudentId}");
                            
                            // Mark as processing
                            var updateProcessing = Builders<ReportCardJob>.Update
                                .Set(j => j.Status, "processing")
                                .Set(j => j.UpdatedAt, DateTime.UtcNow);
                            await mongoService.ReportCardJobs.UpdateOneAsync(j => j.Id == job.Id, updateProcessing, cancellationToken: stoppingToken);

                            try
                            {
                                // Retrieve Student details
                                var student = await mongoService.Students.Find(s => s.Id == job.StudentId).FirstOrDefaultAsync(stoppingToken);
                                if (student == null)
                                {
                                    throw new Exception($"Student with ID {job.StudentId} not found in database.");
                                }

                                // Resolve College Name
                                var collegeName = "EduGuard Affiliated Institution";
                                if (!string.IsNullOrEmpty(student.CollegeId))
                                {
                                    var college = await mongoService.Colleges.Find(c => c.Id == student.CollegeId).FirstOrDefaultAsync(stoppingToken);
                                    if (college != null) collegeName = college.Name;
                                }

                                // Build HTML report card structure
                                var htmlBuilder = new StringBuilder();
                                htmlBuilder.AppendLine("<!DOCTYPE html>");
                                htmlBuilder.AppendLine("<html>");
                                htmlBuilder.AppendLine("<head>");
                                htmlBuilder.AppendLine("<meta charset=\"utf-8\">");
                                htmlBuilder.AppendLine("<title>Academic Progress Report Card</title>");
                                htmlBuilder.AppendLine("<style>");
                                htmlBuilder.AppendLine("  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2D3748; line-height: 1.6; margin: 0; padding: 40px; background-color: #F7FAFC; }");
                                htmlBuilder.AppendLine("  .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; border: 1px border #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }");
                                htmlBuilder.AppendLine("  .header { text-align: center; border-bottom: 2px solid #E2E8F0; padding-bottom: 24px; margin-bottom: 24px; }");
                                htmlBuilder.AppendLine("  .institution { font-size: 20px; font-weight: 800; color: #1A365D; text-transform: uppercase; letter-spacing: 1px; }");
                                htmlBuilder.AppendLine("  .title { font-size: 16px; color: #4A5568; margin-top: 4px; font-weight: 600; }");
                                htmlBuilder.AppendLine("  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; }");
                                htmlBuilder.AppendLine("  .info-item { font-size: 13px; }");
                                htmlBuilder.AppendLine("  .info-label { font-weight: bold; color: #718096; text-transform: uppercase; font-size: 11px; }");
                                htmlBuilder.AppendLine("  .info-value { color: #2D3748; font-weight: 600; margin-top: 2px; }");
                                htmlBuilder.AppendLine("  table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 30px; }");
                                htmlBuilder.AppendLine("  th { background-color: #F7FAFC; color: #4A5568; font-weight: bold; text-align: left; padding: 12px 16px; border-bottom: 2px solid #E2E8F0; font-size: 12px; text-transform: uppercase; }");
                                htmlBuilder.AppendLine("  td { padding: 12px 16px; border-bottom: 1px solid #E2E8F0; font-size: 13px; }");
                                htmlBuilder.AppendLine("  .badge { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase; }");
                                htmlBuilder.AppendLine("  .badge-low { background-color: #DEF7EC; color: #03543F; }");
                                htmlBuilder.AppendLine("  .badge-medium { background-color: #FEF3C7; color: #92400E; }");
                                htmlBuilder.AppendLine("  .badge-high { background-color: #FDE8E8; color: #9B1C1C; }");
                                htmlBuilder.AppendLine("  .badge-critical { background-color: #FDE8E8; color: #C81E1E; border: 1px solid #F8B4B4; }");
                                htmlBuilder.AppendLine("  .section-title { font-size: 14px; font-weight: bold; color: #2D3748; border-left: 4px solid #3182CE; padding-left: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }");
                                htmlBuilder.AppendLine("  .summary-box { background-color: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 30px; }");
                                htmlBuilder.AppendLine("  .footer { text-align: center; font-size: 11px; color: #A0AEC0; border-top: 1px solid #E2E8F0; padding-top: 20px; margin-top: 40px; }");
                                htmlBuilder.AppendLine("</style>");
                                htmlBuilder.AppendLine("</head>");
                                htmlBuilder.AppendLine("<body>");
                                htmlBuilder.AppendLine("  <div className=\"container\">");
                                htmlBuilder.AppendLine("    <div className=\"header\">");
                                htmlBuilder.AppendLine($"      <div className=\"institution\">{collegeName}</div>");
                                htmlBuilder.AppendLine("      <div className=\"title\">Academic Progress & Performance Report Card</div>");
                                htmlBuilder.AppendLine("    </div>");
                                
                                // Info Grid
                                htmlBuilder.AppendLine("    <div className=\"info-grid\">");
                                htmlBuilder.AppendLine("      <div className=\"info-item\">");
                                htmlBuilder.AppendLine("        <div className=\"info-label\">Student Name</div>");
                                htmlBuilder.AppendLine($"        <div className=\"info-value\">{student.Name}</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div className=\"info-item\">");
                                htmlBuilder.AppendLine("        <div className=\"info-label\">Roll Number</div>");
                                htmlBuilder.AppendLine($"        <div className=\"info-value\">#{student.RollNo}</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div className=\"info-item\">");
                                htmlBuilder.AppendLine("        <div className=\"info-label\">Course & Semester</div>");
                                htmlBuilder.AppendLine($"        <div className=\"info-value\">{student.Course} (Semester {student.Semester})</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div className=\"info-item\">");
                                htmlBuilder.AppendLine("        <div className=\"info-label\">Assigned Class</div>");
                                htmlBuilder.AppendLine($"        <div className=\"info-value\">{student.Class}</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div className=\"info-item\">");
                                htmlBuilder.AppendLine("        <div className=\"info-label\">Attendance Rate</div>");
                                htmlBuilder.AppendLine($"        <div className=\"info-value\">{student.Attendance}%</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div className=\"info-item\">");
                                htmlBuilder.AppendLine("        <div className=\"info-label\">Risk Evaluation Status</div>");
                                htmlBuilder.AppendLine($"        <div className=\"info-value\"><span className=\"badge badge-{student.RiskLevel}\">{student.RiskLevel} Risk</span></div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("    </div>");

                                // Marks Table
                                htmlBuilder.AppendLine("    <div className=\"section-title\">Subject-wise Performance Record</div>");
                                htmlBuilder.AppendLine("    <table>");
                                htmlBuilder.AppendLine("      <thead>");
                                htmlBuilder.AppendLine("        <tr>");
                                htmlBuilder.AppendLine("          <th>Subject Title</th>");
                                htmlBuilder.AppendLine("          <th>Class Tests</th>");
                                htmlBuilder.AppendLine("          <th>Mid Term (100)</th>");
                                htmlBuilder.AppendLine("          <th>House Exam (100)</th>");
                                htmlBuilder.AppendLine("        </tr>");
                                htmlBuilder.AppendLine("      </thead>");
                                htmlBuilder.AppendLine("      <tbody>");

                                if (student.Marks != null && student.Marks.Count > 0)
                                {
                                    foreach (var mark in student.Marks)
                                    {
                                        var midTermStr = mark.MidTerm?.Marks?.ToString() ?? "N/A";
                                        var houseExamStr = mark.HouseExam?.Marks?.ToString() ?? "N/A";
                                        var testsStr = "No Tests";
                                        if (mark.ClassTests != null && mark.ClassTests.Count > 0)
                                        {
                                            testsStr = string.Join(", ", mark.ClassTests.Select(t => $"{t.Marks}/{t.MaxMarks}"));
                                        }

                                        htmlBuilder.AppendLine("        <tr>");
                                        htmlBuilder.AppendLine($"          <td style=\"font-weight: 600;\">{mark.SubjectName}</td>");
                                        htmlBuilder.AppendLine($"          <td>{testsStr}</td>");
                                        htmlBuilder.AppendLine($"          <td>{midTermStr}</td>");
                                        htmlBuilder.AppendLine($"          <td>{houseExamStr}</td>");
                                        htmlBuilder.AppendLine("        </tr>");
                                    }
                                }
                                else
                                {
                                    htmlBuilder.AppendLine("        <tr>");
                                    htmlBuilder.AppendLine("          <td colspan=\"4\" style=\"text-align: center; color: #718096; font-style: italic;\">No academic marks recorded for this semester yet.</td>");
                                    htmlBuilder.AppendLine("        </tr>");
                                }

                                htmlBuilder.AppendLine("      </tbody>");
                                htmlBuilder.AppendLine("    </table>");

                                // Mentor Feedback & Plans
                                htmlBuilder.AppendLine("    <div className=\"section-title\">AI Assessed Development Plans</div>");
                                htmlBuilder.AppendLine("    <div className=\"summary-box\">");
                                htmlBuilder.AppendLine("      <div className=\"info-label\" style=\"margin-bottom: 6px;\">Risk Factor Diagnostics:</div>");
                                htmlBuilder.AppendLine($"      <p style=\"font-size: 12px; color: #4A5568; margin-top: 0; margin-bottom: 16px;\">{(string.IsNullOrEmpty(student.RiskExplanation) ? "No detailed risk diagnosis is generated yet." : student.RiskExplanation)}</p>");
                                htmlBuilder.AppendLine("      <div className=\"info-label\" style=\"margin-bottom: 6px;\">Academic Remedial Study Plan:</div>");
                                htmlBuilder.AppendLine($"      <p style=\"font-size: 12px; color: #4A5568; margin: 0;\">{(string.IsNullOrEmpty(student.AiImprovementPlan) ? "No study improvement plan generated yet." : student.AiImprovementPlan)}</p>");
                                htmlBuilder.AppendLine("    </div>");

                                htmlBuilder.AppendLine("    <div className=\"footer\">");
                                htmlBuilder.AppendLine($"      Generated automatically by EduGuard. Report Card ID: {job.Id} &middot; Date: {DateTime.UtcNow.ToShortDateString()}");
                                htmlBuilder.AppendLine("    </div>");
                                htmlBuilder.AppendLine("  </div>");
                                htmlBuilder.AppendLine("</body>");
                                htmlBuilder.AppendLine("</html>");

                                // Ensure directories exist in wwwroot
                                var reportsDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "reports");
                                if (!Directory.Exists(reportsDir))
                                {
                                    Directory.CreateDirectory(reportsDir);
                                }

                                var fileName = $"report-card-{job.Id}.html";
                                var filePath = Path.Combine(reportsDir, fileName);
                                await File.WriteAllTextAsync(filePath, htmlBuilder.ToString(), Encoding.UTF8, stoppingToken);

                                // Mark Job as completed
                                var updateCompleted = Builders<ReportCardJob>.Update
                                    .Set(j => j.Status, "completed")
                                    .Set(j => j.OutputFile, $"/reports/{fileName}")
                                    .Set(j => j.UpdatedAt, DateTime.UtcNow);
                                await mongoService.ReportCardJobs.UpdateOneAsync(j => j.Id == job.Id, updateCompleted, cancellationToken: stoppingToken);
                                
                                _logger.LogInformation($"Successfully completed report card generation for job: {job.Id}");
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, $"Failed to process report card generation job: {job.Id}");
                                var updateFailed = Builders<ReportCardJob>.Update
                                    .Set(j => j.Status, "failed")
                                    .Set(j => j.Error, ex.Message)
                                    .Set(j => j.UpdatedAt, DateTime.UtcNow);
                                await mongoService.ReportCardJobs.UpdateOneAsync(j => j.Id == job.Id, updateFailed, cancellationToken: stoppingToken);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in Report Queue Worker iteration.");
                }

                // Poll every 5 seconds
                await Task.Delay(5000, stoppingToken);
            }

            _logger.LogInformation("Report Queue Worker stopped.");
        }
    }
}
