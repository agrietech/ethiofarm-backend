const { prisma } = require('../config/db');
const redis = require('../config/redis');

/**
 * Query Cache Utility
 * Centralized caching for commonly repeated queries
 */
class QueryCache {
  /**
   * Get farm count for a woreda with caching
   */
  static async getFarmCount(woredaId) {
    const cacheKey = `count:farms:${woredaId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) return parseInt(cached);

    const count = await prisma.farm.count({ where: { woredaId } });
    await redis.setex(cacheKey, 300, count.toString()); // 5 min cache
    
    return count;
  }

  /**
   * Get sensor count for a farm/woreda
   */
  static async getSensorCount(farmId = null, woredaId = null) {
    const cacheKey = farmId 
      ? `count:sensors:farm:${farmId}` 
      : `count:sensors:woreda:${woredaId}`;
    
    const cached = await redis.get(cacheKey);
    if (cached) return parseInt(cached);

    const where = farmId ? { farmId } : { farm: { woredaId } };
    const count = await prisma.sensor.count({ where });
    
    await redis.setex(cacheKey, 300, count.toString());
    return count;
  }

  /**
   * Get active alerts count
   */
  static async getActiveAlertsCount(woredaId = null) {
    const cacheKey = woredaId 
      ? `count:alerts:${woredaId}` 
      : 'count:alerts:all';
    
    const cached = await redis.get(cacheKey);
    if (cached) return parseInt(cached);

    const where = { status: 'ACTIVE' };
    if (woredaId) where.woredaId = woredaId;

    const count = await prisma.alert.count({ where });
    await redis.setex(cacheKey, 120, count.toString()); // 2 min cache
    
    return count;
  }

  /**
   * Get woreda details with caching
   */
  static async getWoreda(woredaId) {
    const cacheKey = `woreda:${woredaId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) return JSON.parse(cached);

    const woreda = await prisma.woreda.findUnique({
      where: { id: woredaId },
      include: {
        zone: {
          include: { region: true }
        }
      }
    });

    if (woreda) {
      await redis.setex(cacheKey, 3600, JSON.stringify(woreda)); // 1 hour
    }

    return woreda;
  }

  /**
   * Get zone details with caching
   */
  static async getZone(zoneId) {
    const cacheKey = `zone:${zoneId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) return JSON.parse(cached);

    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      include: { region: true }
    });

    if (zone) {
      await redis.setex(cacheKey, 3600, JSON.stringify(zone));
    }

    return zone;
  }

  /**
   * Get region details with caching
   */
  static async getRegion(regionId) {
    const cacheKey = `region:${regionId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) return JSON.parse(cached);

    const region = await prisma.region.findUnique({
      where: { id: regionId }
    });

    if (region) {
      await redis.setex(cacheKey, 3600, JSON.stringify(region));
    }

    return region;
  }

  /**
   * Get user count by role and location
   */
  static async getUserCount(role = null, woredaId = null, zoneId = null, regionId = null) {
    const parts = ['count:users'];
    const where = {};

    if (role) {
      parts.push(`role:${role}`);
      where.role = role;
    }

    if (woredaId) {
      parts.push(`woreda:${woredaId}`);
      where.woredaId = woredaId;
    } else if (zoneId) {
      parts.push(`zone:${zoneId}`);
      where.zoneId = zoneId;
    } else if (regionId) {
      parts.push(`region:${regionId}`);
      where.regionId = regionId;
    }

    const cacheKey = parts.join(':');
    const cached = await redis.get(cacheKey);
    
    if (cached) return parseInt(cached);

    const count = await prisma.user.count({ where });
    await redis.setex(cacheKey, 600, count.toString()); // 10 min cache

    return count;
  }

  /**
   * Invalidate cache for a resource
   */
  static async invalidate(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Invalidate farm-related caches
   */
  static async invalidateFarmCache(farmId = null, woredaId = null) {
    if (farmId) {
      await this.invalidate(`*farm:${farmId}*`);
    }
    if (woredaId) {
      await this.invalidate(`*woreda:${woredaId}*`);
      await this.invalidate(`count:farms:${woredaId}`);
    }
  }

  /**
   * Invalidate alert-related caches
   */
  static async invalidateAlertCache(woredaId = null) {
    if (woredaId) {
      await this.invalidate(`count:alerts:${woredaId}`);
    } else {
      await this.invalidate('count:alerts:*');
    }
  }

  /**
   * Invalidate sensor-related caches
   */
  static async invalidateSensorCache(farmId = null, woredaId = null) {
    if (farmId) {
      await this.invalidate(`count:sensors:farm:${farmId}`);
    }
    if (woredaId) {
      await this.invalidate(`count:sensors:woreda:${woredaId}`);
    }
  }

  /**
   * Clear all cache
   */
  static async clearAll() {
    await redis.flushdb();
  }
}

module.exports = QueryCache;
