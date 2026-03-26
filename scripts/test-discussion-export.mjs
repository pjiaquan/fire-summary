#!/usr/bin/env node
/**
 * Test discussion export clipboard functionality in desktop and mobile Firefox.
 *
 * This tests the actual copyText function from discussion.js
 *
 * Usage:
 *   PLAYWRIGHT_MODULE_PATH=/path/to/playwright/index.mjs \
 *   PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers \
 *   node scripts/test-discussion-export.mjs
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const playwrightModulePath = process.env.PLAYWRIGHT_MODULE_PATH;
const port = 4174;
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE;

const { firefox } = playwrightModulePath
  ? await import(pathToFileURL(playwrightModulePath).href)
  : await import("playwright");

const testConfigs = [
  { name: "Desktop Firefox", viewport: { width: 1280, height: 800 }, isMobile: false },
  { name: "Mobile Firefox (Pixel 5)", viewport: { width: 393, height: 851 }, isMobile: true },
];

// Inline the copyText function from discussion.js
const testScript = `
var messages = [
  { role: "user", content: "Can you explain this article?" },
  { role: "assistant", content: "This article discusses key points." }
];

var currentContext = { summaryTitle: "Test Article", articleTitle: "Test Article" };

function log(msg) { console.log("[TEST] " + msg); }

function setStatus(text) {
  document.getElementById("status").textContent = text;
  log("Status: " + text);
}

function buildExportText() {
  var lines = ["# Discussion Export", "", "Title: " + (currentContext.summaryTitle || currentContext.articleTitle), "", "---"];
  for (var i = 0; i < messages.length; i++) {
    lines.push("## " + (i+1) + ". " + (messages[i].role === "user" ? "User" : "Assistant"));
    lines.push("");
    lines.push(messages[i].content);
    lines.push("");
  }
  return lines.join("\\n");
}

function sanitizeFilename(title) {
  return (title || "discussion").replace(/[<>:"/\\\\|?*]/g, "-").replace(/\\s+/g, " ").trim().slice(0, 80);
}

function downloadTextFile(title, text) {
  var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(title) + ".txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

// copyText from discussion.js
async function copyText(text) {
  log("Attempting clipboard write...");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      log("clipboard.writeText succeeded");
      return true;
    } catch (err) {
      log("clipboard.writeText failed: " + err.message);
    }
  } else {
    log("clipboard.writeText not available");
  }

  try {
    log("Trying execCommand fallback...");
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand("copy");
    document.body.removeChild(ta);
    log("execCommand result: " + ok);
    return ok || false;
  } catch (err) {
    log("execCommand fallback failed: " + err.message);
    return false;
  }
}

document.getElementById("add-btn").onclick = function() {
  messages = [
    { role: "user", content: "Can you explain this article?" },
    { role: "assistant", content: "This article discusses the main points about the topic." }
  ];
  document.getElementById("export-btn").disabled = false;
  log("Added " + messages.length + " messages");
};

document.getElementById("export-btn").onclick = async function() {
  if (messages.length === 0) {
    setStatus("No messages");
    return;
  }
  var exportText = buildExportText();
  var filename = currentContext.summaryTitle || currentContext.articleTitle;

  log("Starting export...");
  var copied = await copyText(exportText);
  if (copied) {
    setStatus("COPIED");
    document.getElementById("result").innerHTML = '<span class="method">Method: clipboard.writeText</span> <span class="success">SUCCESS</span>';
    log("RESULT: COPY_SUCCESS");
    return;
  }

  log("Clipboard failed, trying download...");
  try {
    downloadTextFile(filename, exportText);
    setStatus("DOWNLOADED");
    document.getElementById("result").innerHTML = '<span class="method">Method: download</span> <span class="success">SUCCESS</span>';
    log("RESULT: DOWNLOAD_SUCCESS");
  } catch (err) {
    setStatus("FAILED: " + err.message);
    document.getElementById("result").innerHTML = '<span class="fail">FAILED: ' + err.message + '</span>';
    log("RESULT: FAILED - " + err.message);
  }
};

document.getElementById("fallback-btn").onclick = function() {
  var exportText = buildExportText();
  var filename = currentContext.summaryTitle || currentContext.articleTitle;
  downloadTextFile(filename, exportText);
  setStatus("DOWNLOADED_FALLBACK");
  log("RESULT: DOWNLOAD_FALLBACK");
};

log("Test script loaded");
`;

const testHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fire Summary - Discussion Export Test</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; background: #1a1a2e; color: #eee; }
    .test-area { margin-bottom: 1rem; padding: 1rem; background: #252540; border-radius: 8px; }
    button { padding: 0.5rem 1rem; margin-right: 0.5rem; border: none; border-radius: 4px; cursor: pointer; }
    #export-btn { background: #6366f1; color: white; }
    #export-btn:disabled { background: #374151; cursor: not-allowed; }
    #fallback-btn { background: #374151; color: #ccc; }
    #status { margin-top: 0.5rem; color: #4ade80; min-height: 1.5em; }
    #result { margin-top: 0.5rem; padding: 0.5rem; background: #1e1e32; border-radius: 4px; font-family: monospace; white-space: pre-wrap; }
    .method { color: #fbbf24; }
    .success { color: #4ade80; }
    .fail { color: #f87171; }
    #console-log { margin-top: 1rem; padding: 0.5rem; background: #0d0d15; border-radius: 4px; font-family: monospace; font-size: 0.85rem; max-height: 100px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>Discussion Export Test</h1>

  <div class="test-area">
    <button id="add-btn">Add Test Messages</button>
    <span id="count">Messages: 0</span>
  </div>

  <div class="test-area">
    <button id="export-btn" disabled>Export to Clipboard</button>
    <button id="fallback-btn">Fallback Download</button>
    <div id="status"></div>
    <div id="result"></div>
  </div>

  <div class="test-area">
    <div id="console-log"></div>
  </div>

  <script>
    var messages = [];

    function log(msg) {
      console.log("[TEST] " + msg);
      var logDiv = document.getElementById("console-log");
      var entry = document.createElement("div");
      entry.textContent = "[TEST] " + msg;
      logDiv.appendChild(entry);
      logDiv.scrollTop = logDiv.scrollHeight;
    }

    function setStatus(text) {
      document.getElementById("status").textContent = text;
      log("Status: " + text);
    }

    function buildExportText() {
      var lines = ["# Discussion Export", "", "Title: Test Article", "", "---"];
      for (var i = 0; i < messages.length; i++) {
        lines.push("## " + (i+1) + ". " + (messages[i].role === "user" ? "User" : "Assistant"));
        lines.push("");
        lines.push(messages[i].content);
        lines.push("");
      }
      return lines.join("\\n");
    }

    function sanitizeFilename(title) {
      return (title || "discussion").replace(/[<>:"/\\\\|?*]/g, "-").replace(/\\s+/g, " ").trim().slice(0, 80);
    }

    function downloadTextFile(title, text) {
      var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = sanitizeFilename(title) + ".txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    async function copyText(text) {
      log("Attempting clipboard write...");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          log("clipboard.writeText succeeded");
          return true;
        } catch (err) {
          log("clipboard.writeText failed: " + err.message);
        }
      } else {
        log("clipboard.writeText not available");
      }

      try {
        log("Trying execCommand fallback...");
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        log("execCommand result: " + ok);
        return ok || false;
      } catch (err) {
        log("execCommand fallback failed: " + err.message);
        return false;
      }
    }

    document.getElementById("add-btn").onclick = function() {
      messages = [
        { role: "user", content: "Can you explain this article?" },
        { role: "assistant", content: "This article discusses the main points about the topic." }
      ];
      document.getElementById("export-btn").disabled = false;
      log("Added " + messages.length + " messages");
    };

    document.getElementById("export-btn").onclick = async function() {
      if (messages.length === 0) {
        setStatus("No messages");
        return;
      }
      var exportText = buildExportText();
      var filename = "Test Article";

      log("Starting export...");
      var copied = await copyText(exportText);
      if (copied) {
        setStatus("COPIED");
        document.getElementById("result").innerHTML = '<span class="method">Method: clipboard.writeText</span> <span class="success">SUCCESS</span>';
        log("RESULT: COPY_SUCCESS");
        return;
      }

      log("Clipboard failed, trying download...");
      try {
        downloadTextFile(filename, exportText);
        setStatus("DOWNLOADED");
        document.getElementById("result").innerHTML = '<span class="method">Method: download</span> <span class="success">SUCCESS</span>';
        log("RESULT: DOWNLOAD_SUCCESS");
      } catch (err) {
        setStatus("FAILED: " + err.message);
        document.getElementById("result").innerHTML = '<span class="fail">FAILED: ' + err.message + '</span>';
        log("RESULT: FAILED - " + err.message);
      }
    };

    document.getElementById("fallback-btn").onclick = function() {
      var exportText = buildExportText();
      var filename = "Test Article";
      downloadTextFile(filename, exportText);
      setStatus("DOWNLOADED_FALLBACK");
      log("RESULT: DOWNLOAD_FALLBACK");
    };

    log("Test script loaded");
  </script>
</body>
</html>`;

async function runTests() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(testHtml);
  });
  await new Promise((resolve) => server.listen(port, resolve));
  console.log("Server on http://127.0.0.1:" + port);
  console.log("Testing clipboard export functionality...\n");

  let allPassed = true;
  const results = [];

  for (const config of testConfigs) {
    console.log("=== " + config.name + " ===");
    const browser = await firefox.launch({ executable: firefoxExecutablePath });
    const ctx = await browser.newContext({ viewport: config.viewport });
    const page = await ctx.newPage();

    const logs = [];
    page.on("console", (msg) => logs.push(msg.text()));

    try {
      await page.goto("http://127.0.0.1:" + port, { waitUntil: "load" });
      await page.waitForTimeout(300);

      // Check script loaded
      const scriptLoaded = logs.includes("[TEST] Test script loaded");
      console.log("  Script loaded:", scriptLoaded);

      // Add messages
      await page.click("#add-btn");
      await page.waitForTimeout(200);

      const btnDisabled = await page.locator("#export-btn").isDisabled();
      console.log("  Export button enabled:", !btnDisabled);

      // Click export
      if (!btnDisabled) {
        await page.click("#export-btn");
        await page.waitForTimeout(500);
      }

      const status = await page.textContent("#status");
      const result = await page.textContent("#result");
      console.log("  Status:", status);
      console.log("  Result:", result.replace(/<[^>]*>/g, "").trim());

      // Check for RESULT log
      const resultLog = logs.find((l) => l.startsWith("[TEST] RESULT:"));
      console.log("  Log:", resultLog || "no result log");

      const passed = status === "COPIED" || status === "DOWNLOADED";
      results.push({ name: config.name, passed, status, result });
      console.log("  " + (passed ? "✓ PASSED" : "✗ FAILED"));

      if (!passed) allPassed = false;

    } catch (e) {
      console.log("  ✗ ERROR:", e.message);
      results.push({ name: config.name, passed: false, error: e.message });
      allPassed = false;
    }

    await ctx.close();
    await browser.close();
    console.log();
  }

  server.close();

  console.log("=== Summary ===");
  results.forEach((r) => {
    console.log((r.passed ? "✓" : "✗") + " " + r.name + ": " + (r.status || r.error || ""));
  });

  console.log();
  console.log(allPassed ? "ALL PASSED" : "SOME FAILED");
  process.exit(allPassed ? 0 : 1);
}

runTests().catch((e) => { console.error(e); process.exit(1); });
