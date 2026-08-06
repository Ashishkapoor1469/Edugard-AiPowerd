using Lms.Api.Data;
using Lms.Api.Seed;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Lms.Api.Controllers;

[ApiController, Route("api/demo")]
public sealed class DemoController : ControllerBase
{
    private readonly LmsMongoContext _db;
    private readonly IConfiguration _config;

    public DemoController(LmsMongoContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    [HttpPost("seed"), Authorize(Roles = "college-admin,librarian")]
    public async Task<IActionResult> SeedDemoData(CancellationToken token)
    {
        var enabled = _config.GetValue<bool>("LMS_ENABLE_DEMO_SEED", true);
        if (!enabled)
        {
            return BadRequest(new { success = false, message = "Demo data seeding is disabled in this environment." });
        }

        await DemoDataSeeder.SeedAsync(_db, token);
        return Ok(new
        {
            success = true,
            message = "Demo data seeded successfully for Dronacharya College of Engineering.",
            collegeId = DemoDataSeeder.DemoCollegeId
        });
    }
}
