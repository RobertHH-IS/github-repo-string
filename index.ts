import { Elysia } from "elysia";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

const app = new Elysia();

const REPO_DIR = "/tmp/repo";
const ALLOWED_EXTENSIONS = [
  ".py",
  ".js",
  ".jsx",
  ".tsx",
  ".ts",
  ".html",
  ".css",
  ".java",
  ".cpp",
  ".c",
  ".go",
];
const FILE_DELIMITER = "\n===== FILE DELIMITER =====\n";

function log(message: any) {
  console.log(`[${new Date().toISOString()}] ${JSON.stringify(message)}`);
}

function logError(message: string, error: any) {
  log(`ERROR - ${message}`);
  if (error instanceof Error) {
    log(`Error name: ${error.name}`);
    log(`Error message: ${error.message}`);
    log(`Error stack: ${error.stack}`);
  } else {
    log(`Unknown error: ${String(error)}`);
  }
}

async function cloneRepo(url: string): Promise<void> {
  log(`Cloning repository: ${url}`);
  try {
    await execAsync(`git clone ${url} ${REPO_DIR}`);
    log("Repository cloned successfully");
  } catch (error) {
    log(
      `Error cloning repository: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

function readCodeFiles(dir: string, baseDir: string = REPO_DIR): string {
  log(`Reading code files from directory: ${dir}`);
  let contentArray: { path: string; content: string }[] = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (file.isDirectory()) {
      log(`Entering directory: ${relativePath}`);
      const subDirContent = readCodeFiles(fullPath, baseDir);
      contentArray.push(...JSON.parse(subDirContent));
    } else if (ALLOWED_EXTENSIONS.includes(path.extname(file.name))) {
      log(`Reading file: ${relativePath}`);
      try {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        contentArray.push({ path: relativePath, content: fileContent });
        log(`File read successfully: ${relativePath}`);
      } catch (error) {
        logError(`Error reading file ${relativePath}`, error);
      }
    }
  }

  // Sort the content array by file path
  contentArray.sort((a, b) => a.path.localeCompare(b.path));

  return JSON.stringify(contentArray);
}

async function cleanUp(): Promise<void> {
  log("Cleaning up temporary directory");
  try {
    await execAsync(`rm -rf ${REPO_DIR}`);
    log("Cleanup completed successfully");
  } catch (error) {
    log(
      `Error during cleanup: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

app.post("/process-repo", async ({ body }) => {
  log("Received request to process repository");
  const { url } = body as { url: string };

  if (!url) {
    log("Error: GitHub URL is required");
    return { error: "GitHub URL is required" };
  }

  try {
    log(`Processing repository: ${url}`);
    await cloneRepo(url);
    const codeContentArray = JSON.parse(readCodeFiles(REPO_DIR));
    const codeContent = codeContentArray
      .map(
        (file: { path: string; content: string }) =>
          `File: ${file.path}\n\n${file.content}\n${FILE_DELIMITER}`
      )
      .join("");
    await cleanUp();
    log("Repository processed successfully");
    return { content: codeContent };
  } catch (error) {
    logError("Error processing repository", error);
    await cleanUp();
    return {
      error: `Failed to process repository: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT);
log(`Server is running on http://localhost:${PORT}`);

// Graceful shutdown handler
async function gracefulShutdown() {
  log("Received shutdown signal. Closing HTTP server.");
  await app.stop();
  log("HTTP server closed.");
  try {
    await cleanUp();
    log("Cleanup completed. Exiting process.");
    process.exit(0);
  } catch (error) {
    log(
      `Error during cleanup: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}

// Listen for shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Error handling for unhandled promises
process.on("unhandledRejection", (reason, promise) => {
  log("Unhandled Rejection at:");
  log(promise);
  log("Reason:");
  log(reason);
});
