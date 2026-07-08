using System;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;

namespace EduGuard.Services
{
    public class CacheService
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
        private readonly IDistributedCache _cache;
        private readonly ILogger<CacheService> _logger;

        public CacheService(IDistributedCache cache, ILogger<CacheService> logger)
        {
            _cache = cache;
            _logger = logger;
        }

        public async Task<T> GetOrCreateAsync<T>(string key, TimeSpan ttl, Func<Task<T>> factory)
        {
            try
            {
                var cached = await _cache.GetStringAsync(key);
                if (!string.IsNullOrEmpty(cached))
                {
                    var value = JsonSerializer.Deserialize<T>(cached, JsonOptions);
                    if (value is not null)
                    {
                        _logger.LogInformation("[CACHE] Hit {Key}", key);
                        return value;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[CACHE] Read failed for {Key}: {Error}", key, ex.GetType().Name);
            }

            _logger.LogInformation("[CACHE] Miss {Key}", key);
            var fresh = await factory();

            try
            {
                await _cache.SetStringAsync(
                    key,
                    JsonSerializer.Serialize(fresh, JsonOptions),
                    new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl }
                );
                _logger.LogInformation("[CACHE] Stored {Key}", key);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[CACHE] Write failed for {Key}: {Error}", key, ex.GetType().Name);
            }

            return fresh;
        }

        public async Task RemoveAsync(params string[] keys)
        {
            foreach (var key in keys)
            {
                try
                {
                    await _cache.RemoveAsync(key);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("[CACHE] Remove failed for {Key}: {Error}", key, ex.GetType().Name);
                }
            }
        }
    }
}
