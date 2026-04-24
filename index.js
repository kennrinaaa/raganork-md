const path = require("path");
const fs = require("fs");

// Ensure config.env is generated from Railway ENV
if (!fs.existsSync("./config.env")) {
  const SESSION = process.env.SESSION;

  if (!SESSION) {
    console.error("❌ SESSION not found in environment variables.");
    process.exit(1);
  }

  fs.writeFileSync(
    "./config.env",
    `SESSION=${SESSION}
USE_SERVER=true
TEMP_DIR=./temp
`
  );
}

// Load env
require("dotenv").config({ path: "./config.env" });

const { suppressLibsignalLogs } = require("./core/helpers");
suppressLibsignalLogs();

const { initializeDatabase } = require("./core/database");
const { BotManager } = require("./core/manager");
const config = require("./config");
const { SESSION, logger } = config;
const http = require("http");
const {
  ensureTempDir,
  TEMP_DIR,
  initializeKickBot,
  cleanupKickBot,
} = require("./core/helpers");

async function main() {
  ensureTempDir();
  logger.info(`Created temporary directory at ${TEMP_DIR}`);

  console.log(`Raganork v${require("./package.json").version}`);
  console.log(`- Configured sessions: ${SESSION.join(", ")}`);

  if (!SESSION || SESSION.length === 0) {
    console.warn("⚠️ No sessions configured. Check Railway ENV.");
    return;
  }

  // Initialize the database (only once)
  try {
    await initializeDatabase();
    console.log("- Database initialized");
    logger.info("Database initialized successfully.");
  } catch (dbError) {
    console.error(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    logger.fatal(
      "Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    process.exit(1);
  }

  const botManager = new BotManager();

  const shutdownHandler = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    logger.info(`Received ${signal}, shutting down...`);
    cleanupKickBot();
    await botManager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  await botManager.initializeBots();
  console.log("- Bot initialization complete.");
  logger.info("Bot initialization complete");

  initializeKickBot();

  // Start the health / web server (always on, unless explicitly disabled)
  const startServer = () => {
    const PORT = process.env.PORT || 3000;

    const server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Raganork Bot is running!");
      }
    });

    server.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
      logger.info(`Web server listening on port ${PORT}`);
    });
  };

  if (process.env.USE_SERVER !== "false") {
    startServer();
  }
}

// Start the bot (only when this file is run directly)
if (require.main === module) {
  main().catch((error) => {
    console.error(`Fatal error in main execution: ${error.message}`, error);
    logger.fatal({ err: error }, "Fatal error in main execution");
    process.exit(1);
  });
}