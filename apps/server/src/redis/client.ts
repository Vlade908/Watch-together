import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

export const redisPublisher = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

export const redisSubscriber = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

redisClient.on("connect", () => {
  console.log("[Redis] Cliente principal conectado com sucesso.");
});

redisClient.on("error", (err) => {
  console.error("[Redis Error] Cliente principal:", err.message);
});

redisPublisher.on("error", (err) => {
  console.error("[Redis Error] Publisher:", err.message);
});

redisSubscriber.on("error", (err) => {
  console.error("[Redis Error] Subscriber:", err.message);
});
