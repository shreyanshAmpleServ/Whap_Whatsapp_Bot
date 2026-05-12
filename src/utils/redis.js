const redis = require("redis");

const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("connect", () => {
  console.log("✅ Redis Connected");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

(async () => {
  await redisClient.connect();
})();

module.exports = redisClient;
