import type { ConnectionOptions } from 'bullmq';
import { config } from '../config';

/**
 * Redis options for BullMQ (object form avoids duplicate `ioredis` instances vs bullmq's nested copy).
 */
export function getBullMqConnectionOptions(): ConnectionOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
  };
}
