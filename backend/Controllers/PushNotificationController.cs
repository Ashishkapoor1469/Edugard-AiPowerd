using EduGuard.Models;
using EduGuard.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace EduGuard.Controllers;

[ApiController, Authorize, Route("api/push")]
public sealed class PushNotificationController : ControllerBase
{
    private readonly MongoService _mongo;
    public PushNotificationController(MongoService mongo) => _mongo = mongo;

    [HttpPut("devices")]
    public async Task<IActionResult> Register([FromBody] RegisterDeviceRequest request, CancellationToken token)
    {
        var userId = User.FindFirst("id")?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Token) || request.Token.Length > 4096 || request.Platform is not ("android" or "ios"))
            return BadRequest(new { success = false, message = "A valid Android or iOS device token is required" });

        await _mongo.DeviceTokens.UpdateOneAsync(x => x.Token == request.Token,
            Builders<DeviceToken>.Update.Set(x => x.UserId, userId).SetOnInsert(x => x.Token, request.Token)
                .Set(x => x.Platform, request.Platform).Set(x => x.UpdatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true }, token);
        return Ok(new { success = true });
    }

    [HttpDelete("devices")]
    public async Task<IActionResult> Unregister([FromBody] RegisterDeviceRequest request, CancellationToken token)
    {
        var userId = User.FindFirst("id")?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        await _mongo.DeviceTokens.DeleteOneAsync(x => x.UserId == userId && x.Token == request.Token, token);
        return Ok(new { success = true });
    }
}

public sealed record RegisterDeviceRequest(string Token, string Platform = "android");
