module.exports = {
  apps: [
    {
      name: "ph-scraper",
      script: "./cron-scraper.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      watch: false,
      cron_restart: "0 2 * * *", // Run every day at 2:00 AM
      env: {
        NODE_ENV: "production",
        HEADLESS: "true",
        MAX_PRODUCTS: "300",
        DELAY_BETWEEN_REQUESTS: "2000",
        DEBUG_MODE: "true",
        MAX_MAKERS_PER_PRODUCT: "5",
        SKIP_COMMENTS: "true"
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};