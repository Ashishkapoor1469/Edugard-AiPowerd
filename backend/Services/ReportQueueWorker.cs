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
        private readonly IHostEnvironment _hostEnvironment;

        public ReportQueueWorker(IServiceProvider serviceProvider, ILogger<ReportQueueWorker> logger, IHostEnvironment hostEnvironment)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _hostEnvironment = hostEnvironment;
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
                                htmlBuilder.AppendLine("  <div class=\"container\">");
                                htmlBuilder.AppendLine("    <div class=\"header\">");
                                htmlBuilder.AppendLine($"      <div class=\"institution\">{collegeName}</div>");
                                htmlBuilder.AppendLine("      <div class=\"title\">Academic Progress & Performance Report Card</div>");
                                htmlBuilder.AppendLine("    </div>");
                                
                                // Info Grid
                                htmlBuilder.AppendLine("    <div class=\"info-grid\">");
                                htmlBuilder.AppendLine("      <div class=\"info-item\">");
                                htmlBuilder.AppendLine("        <div class=\"info-label\">Student Name</div>");
                                htmlBuilder.AppendLine($"        <div class=\"info-value\">{student.Name}</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div class=\"info-item\">");
                                htmlBuilder.AppendLine("        <div class=\"info-label\">Roll Number</div>");
                                htmlBuilder.AppendLine($"        <div class=\"info-value\">#{student.RollNo}</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div class=\"info-item\">");
                                htmlBuilder.AppendLine("        <div class=\"info-label\">Course & Semester</div>");
                                htmlBuilder.AppendLine($"        <div class=\"info-value\">{student.Course} (Semester {student.Semester})</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div class=\"info-item\">");
                                htmlBuilder.AppendLine("        <div class=\"info-label\">Assigned Class</div>");
                                htmlBuilder.AppendLine($"        <div class=\"info-value\">{student.Class}</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div class=\"info-item\">");
                                htmlBuilder.AppendLine("        <div class=\"info-label\">Attendance Rate</div>");
                                htmlBuilder.AppendLine($"        <div class=\"info-value\">{student.Attendance}%</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div class=\"info-item\">");
                                htmlBuilder.AppendLine("        <div class=\"info-label\">Risk Evaluation Status</div>");
                                htmlBuilder.AppendLine($"        <div class=\"info-value\"><span class=\"badge badge-{student.RiskLevel}\">{student.RiskLevel} Risk</span></div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("    </div>");

                                // Marks Table
                                htmlBuilder.AppendLine("    <div class=\"section-title\">Subject-wise Performance Record</div>");
                                htmlBuilder.AppendLine("    <table>");
                                htmlBuilder.AppendLine("      <thead>");
                                htmlBuilder.AppendLine("        <tr>");
                                htmlBuilder.AppendLine("          <th>Subject</th>");
                                htmlBuilder.AppendLine("          <th>Class Tests</th>");
                                htmlBuilder.AppendLine("          <th>Mid Term</th>");
                                htmlBuilder.AppendLine("          <th>House Exam</th>");
                                htmlBuilder.AppendLine("          <th>Total</th>");
                                htmlBuilder.AppendLine("          <th>Grade</th>");
                                htmlBuilder.AppendLine("        </tr>");
                                htmlBuilder.AppendLine("      </thead>");
                                htmlBuilder.AppendLine("      <tbody>");

                                if (student.Marks != null && student.Marks.Count > 0)
                                {
                                    foreach (var mark in student.Marks)
                                    {
                                        var midTermMarks = mark.MidTerm?.Marks;
                                        var midTermMax = mark.MidTerm?.MaxMarks ?? 100;
                                        var houseExamMarks = mark.HouseExam?.Marks;
                                        var houseExamMax = mark.HouseExam?.MaxMarks ?? 100;
                                        var midTermStr = midTermMarks.HasValue ? $"{midTermMarks}/{midTermMax}" : "N/A";
                                        var houseExamStr = houseExamMarks.HasValue ? $"{houseExamMarks}/{houseExamMax}" : "N/A";
                                        var testsStr = "No Tests";
                                        double totalMarks = 0;
                                        double totalMax = 0;
                                        if (mark.ClassTests != null && mark.ClassTests.Count > 0)
                                        {
                                            testsStr = string.Join(", ", mark.ClassTests.Select(t => $"{t.Marks}/{t.MaxMarks}"));
                                            totalMarks += mark.ClassTests.Sum(t => t.Marks);
                                            totalMax += mark.ClassTests.Sum(t => t.MaxMarks);
                                        }
                                        if (midTermMarks.HasValue) { totalMarks += midTermMarks.Value; totalMax += midTermMax; }
                                        if (houseExamMarks.HasValue) { totalMarks += houseExamMarks.Value; totalMax += houseExamMax; }

                                        var percentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
                                        var grade = percentage >= 91 ? "A1" : percentage >= 81 ? "A2" : percentage >= 71 ? "B1" : percentage >= 61 ? "B2" : percentage >= 51 ? "C1" : percentage >= 41 ? "C2" : percentage >= 33 ? "D" : "E";
                                        var gradeColor = percentage >= 71 ? "#03543F" : percentage >= 51 ? "#92400E" : "#9B1C1C";

                                        htmlBuilder.AppendLine("        <tr>");
                                        htmlBuilder.AppendLine($"          <td style=\"font-weight: 600;\">{mark.SubjectName}</td>");
                                        htmlBuilder.AppendLine($"          <td>{testsStr}</td>");
                                        htmlBuilder.AppendLine($"          <td>{midTermStr}</td>");
                                        htmlBuilder.AppendLine($"          <td>{houseExamStr}</td>");
                                        htmlBuilder.AppendLine($"          <td style=\"font-weight: 700;\">{totalMarks}/{totalMax}</td>");
                                        htmlBuilder.AppendLine($"          <td><span class=\"badge\" style=\"color: {gradeColor}; background: {(percentage >= 71 ? "#DEF7EC" : percentage >= 51 ? "#FEF3C7" : "#FDE8E8")};\">{grade}</span></td>");
                                        htmlBuilder.AppendLine("        </tr>");
                                    }
                                }
                                else
                                {
                                    htmlBuilder.AppendLine("        <tr>");
                                    htmlBuilder.AppendLine("          <td colspan=\"6\" style=\"text-align: center; color: #718096; font-style: italic;\">No academic marks recorded for this semester yet.</td>");
                                    htmlBuilder.AppendLine("        </tr>");
                                }

                                htmlBuilder.AppendLine("      </tbody>");
                                htmlBuilder.AppendLine("    </table>");

                                // Mentor Feedback & Plans
                                htmlBuilder.AppendLine("    <div class=\"section-title\">AI Assessed Development Plans</div>");
                                htmlBuilder.AppendLine("    <div class=\"summary-box\">");
                                htmlBuilder.AppendLine("      <div class=\"info-label\" style=\"margin-bottom: 6px;\">Risk Factor Diagnostics:</div>");
                                htmlBuilder.AppendLine($"      <p style=\"font-size: 12px; color: #4A5568; margin-top: 0; margin-bottom: 16px;\">{(string.IsNullOrEmpty(student.RiskExplanation) ? "No detailed risk diagnosis is generated yet." : student.RiskExplanation)}</p>");
                                htmlBuilder.AppendLine("      <div class=\"info-label\" style=\"margin-bottom: 6px;\">Academic Remedial Study Plan:</div>");
                                htmlBuilder.AppendLine($"      <p style=\"font-size: 12px; color: #4A5568; margin: 0;\">{(string.IsNullOrEmpty(student.AiImprovementPlan) ? "No study improvement plan generated yet." : student.AiImprovementPlan)}</p>");
                                htmlBuilder.AppendLine("    </div>");

                                // Grading Scale
                                htmlBuilder.AppendLine("    <div class=\"section-title\">Grading Scale</div>");
                                htmlBuilder.AppendLine("    <table style=\"max-width: 400px;\">");
                                htmlBuilder.AppendLine("      <thead><tr><th>Marks Range</th><th>Grade</th></tr></thead>");
                                htmlBuilder.AppendLine("      <tbody>");
                                htmlBuilder.AppendLine("        <tr><td>91 - 100</td><td><span class=\"badge badge-low\">A1</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>81 - 90</td><td><span class=\"badge badge-low\">A2</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>71 - 80</td><td><span class=\"badge badge-low\">B1</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>61 - 70</td><td><span class=\"badge badge-medium\">B2</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>51 - 60</td><td><span class=\"badge badge-medium\">C1</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>41 - 50</td><td><span class=\"badge badge-medium\">C2</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>33 - 40</td><td><span class=\"badge badge-high\">D</span></td></tr>");
                                htmlBuilder.AppendLine("        <tr><td>Below 33</td><td><span class=\"badge badge-critical\">E</span></td></tr>");
                                htmlBuilder.AppendLine("      </tbody>");
                                htmlBuilder.AppendLine("    </table>");

                                // Signatures
                                htmlBuilder.AppendLine("    <div style=\"display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E2E8F0;\">");
                                htmlBuilder.AppendLine("      <div style=\"text-align: center;\">");
                                htmlBuilder.AppendLine("        <div style=\"border-top: 1px solid #CBD5E0; width: 180px; margin-bottom: 6px;\"></div>");
                                htmlBuilder.AppendLine("        <div style=\"font-size: 11px; color: #718096;\">Class Teacher</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("      <div style=\"text-align: center;\">");
                                htmlBuilder.AppendLine("        <div style=\"border-top: 1px solid #CBD5E0; width: 180px; margin-bottom: 6px;\"></div>");
                                htmlBuilder.AppendLine("        <div style=\"font-size: 11px; color: #718096;\">Principal / HOD</div>");
                                htmlBuilder.AppendLine("      </div>");
                                htmlBuilder.AppendLine("    </div>");

                                htmlBuilder.AppendLine("    <div class=\"footer\">");
                                htmlBuilder.AppendLine($"      Generated automatically by EduGuard &middot; Report Card ID: {job.Id} &middot; Date: {DateTime.UtcNow.ToShortDateString()}");
                                htmlBuilder.AppendLine("    </div>");
                                htmlBuilder.AppendLine("  </div>");
                                htmlBuilder.AppendLine("</body>");
                                htmlBuilder.AppendLine("</html>");

                                // Ensure directories exist in wwwroot
                                var reportsDir = Path.Combine(_hostEnvironment.ContentRootPath, "wwwroot", "reports");
                                if (!Directory.Exists(reportsDir))
                                {
                                    Directory.CreateDirectory(reportsDir);
                                }

                                var fileName = $"report-card-{job.StudentId}.html";
                                var filePath = Path.Combine(reportsDir, fileName);
                                await File.WriteAllTextAsync(filePath, htmlBuilder.ToString(), Encoding.UTF8, stoppingToken);

                                // Mark Job as completed
                                var updateCompleted = Builders<ReportCardJob>.Update
                                    .Set(j => j.Status, "completed")
                                    .Set(j => j.OutputFile, $"/api/students/report-card/download/{job.Id}")
                                    .Set(j => j.HtmlContent, htmlBuilder.ToString())
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
