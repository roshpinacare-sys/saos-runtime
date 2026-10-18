import { createClient } from 'redis';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// PostgreSQL connection pool
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

// Cache configuration
const CACHE_CONFIG = {
  ttl: 3600, // 1 hour in seconds
  evictionPolicy: 'allkeys-lru', // Redis eviction policy
  maxMemory: '256mb',
  autoPersistInterval: 300000, // 5 minutes
  staleWhileRevalidate: 30 // seconds
};

class StateReplicaCache {
  constructor() {
    this.redis = redisClient;
    this.pgPool = pgPool;
    this.persistQueue = [];
    this.persistInterval = null;
    
    // Initialize Redis
    this.initializeRedis();
    
    // Start auto-persistence
    this.startAutoPersist();
  }

  async initializeRedis() {
    try {
      await this.redis.connect();
      
      // Configure Redis eviction policy
      await this.redis.configSet('maxmemory', CACHE_CONFIG.maxMemory);
      await this.redis.configSet('maxmemory-policy', CACHE_CONFIG.evictionPolicy);
      
      console.log('Redis cache initialized');
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  startAutoPersist() {
    this.persistInterval = setInterval(async () => {
      if (this.persistQueue.length > 0) {
        await this.persistToPostgres();
      }
    }, CACHE_CONFIG.autoPersistInterval);
  }

  // Generate cache key with prefix
  generateCacheKey(key) {
    return `stateReplica:${key}`;
  }

  // Get data from cache or PostgreSQL
  async get(key) {
    const cacheKey = this.generateCacheKey(key);
    
    try {
      // First try to get from Redis
      const cachedData = await this.redis.get(cacheKey);
      
      if (cachedData !== null) {
        const parsedData = JSON.parse(cachedData);
        
        // Check if data is stale
        if (Date.now() - parsedData.timestamp < (CACHE_CONFIG.ttl * 1000)) {
          return parsedData.value;
        } else {
          // Data is stale, revalidate in background
          this.revalidate(key);
        }
      }
    } catch (error) {
      console.error(`Cache read error for key ${key}:`, error);
    }
    
    // Cache miss or stale data, get from PostgreSQL
    try {
      const result = await this.pgPool.query('SELECT data FROM state_replica WHERE key = $1', [key]);
      
      if (result.rows.length > 0) {
        const value = result.rows[0].data;
        
        // Update cache
        await this.set(key, value);
        
        return value;
      }
    } catch (error) {
      console.error(`Database read error for key ${key}:`, error);
      throw error;
    }
    
    return null;
  }

  // Set data in cache and queue for persistence
  async set(key, value) {
    const cacheKey = this.generateCacheKey(key);
    const dataToCache = {
      value,
      timestamp: Date.now(),
      version: randomUUID()
    };
    
    try {
      // Set in Redis with TTL
      await this.redis.set(cacheKey, JSON.stringify(dataToCache), {
        EX: CACHE_CONFIG.ttl
      });
      
      // Queue for persistence
      this.persistQueue.push({
        key,
        value,
        version: dataToCache.version
      });
      
      // Limit queue size
      if (this.persistQueue.length > 1000) {
        await this.persistToPostgres();
      }
    } catch (error) {
      console.error(`Cache write error for key ${key}:`, error);
      throw error;
    }
  }

  // Delete from cache and database
  async delete(key) {
    const cacheKey = this.generateCacheKey(key);
    
    try {
      // Delete from Redis
      await this.redis.del(cacheKey);
      
      // Delete from PostgreSQL
      await this.pgPool.query('DELETE FROM state_replica WHERE key = $1', [key]);
    } catch (error) {
      console.error(`Delete error for key ${key}:`, error);
      throw error;
    }
  }

  // Revalidate stale data in background
  async revalidate(key) {
    try {
      const value = await this.get(key);
      
      // Update cache with new timestamp
      await this.set(key, value);
    } catch (error) {
      console.error(`Revalidation error for key ${key}:`, error);
    }
  }

  // Persist queued changes to PostgreSQL
  async persistToPostgres() {
    if (this.persistQueue.length === 0) return;
    
    const batch = [...this.persistQueue];
    this.persistQueue = [];
    
    try {
      // Use transaction for atomicity
      const client = await this.pgPool.connect();
      
      try {
        await client.query('BEGIN');
        
        for (const item of batch) {
          // Use INSERT ... ON CONFLICT to handle both new and existing keys
          await client.query(
            `INSERT INTO state_replica (key, data, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (key) 
             DO UPDATE SET data = $2, updated_at = NOW()`,
            [item.key, item.value]
          );
        }
        
        await client.query('COMMIT');
        console.log(`Persisted ${batch.length} changes to PostgreSQL`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Batch persistence failed:', error);
        
        // Re-queue failed items
        this.persistQueue.push(...batch);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Persistence error:', error);
      
      // Re-queue all items if transaction failed
      this.persistQueue.unshift(...batch);
    }
  }

  // Graceful shutdown
  async shutdown() {
    console.log('Shutting down cache layer...');
    
    // Clear persist interval
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
    }
    
    // Persist any remaining changes
    if (this.persistQueue.length > 0) {
      await this.persistToPostgres();
    }
    
    // Close connections
    await this.pgPool.end();
    await this.redis.quit();
    
    console.log('Cache layer shut down successfully');
  }
}

// Initialize cache layer
const cache = new StateReplicaCache();

// Export cache instance and utility functions
export default cache;

// For use in application
export const { get, set, delete } = cache;

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  await cache.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await cache.shutdown();
  process.exit(0);
});