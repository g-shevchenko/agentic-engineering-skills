#!/usr/bin/env node
/* Safe local queue runner for Claude Code.
 * No external dependencies. Processes markdown checkbox tasks one at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    queue: ".claude/queue/tasks.md",
    hours: 8,
    maxTasks: 20,
    maxTurns: 25,
    claudeBin: process.env.CLAUDE_BIN || "claude",
    permissionMode: process.env.CLAUDE_QUEUE_PERMISSION_MODE || "",
    skipPermissions: process.env.CLAUDE_QUEUE_SKIP_PERMISSIONS === "1",
    dryRun: false,
    once: false,
    noCommit: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--queue") args.queue = next();
    else if (arg === "--hours") args.hours = Number(next());
    else if (arg === "--max-tasks") args.maxTasks = Number(next());
    else if (arg === "--max-turns") args.maxTurns = Number(next());
    else if (arg === "--claude-bin") args.claudeBin = next();
    else if (arg === "--permission-mode") args.permissionMode = next();
    else if (arg === "--skip-permissions") args.skipPermissions = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--once") args.once = true;
    else if (arg === "--no-commit") args.noCommit = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.hours) || args.hours <= 0) throw new Error("--hours must be a positive number");
  if (!Number.isInteger(args.maxTasks) || args.maxTasks <= 0) throw new Error("--max-tasks must be a positive integer");
  if (!Number.isInteger(args.maxTurns) || args.maxTurns <= 0) throw new Error("--max-turns must be a positive integer");
  return args;
}

function usage() {
  return `Usage:
  node skills/overnight-task-queue/scripts/claude_queue_runner.mjs [options]

Options:
  --queue <path>       Markdown queue file (default: .claude/queue/tasks.md)
  --hours <n>          Time budget in hours (default: 8)
  --max-tasks <n>      Maximum tasks to process (default: 20)
  --max-turns <n>      Claude Code max turns per task (default: 25)
  --claude-bin <path>  Claude Code binary (default: claude or CLAUDE_BIN)
  --permission-mode <mode>  Claude permission mode (e.g. acceptEdits, bypassPermissions)
  --skip-permissions   Pass --dangerously-skip-permissions (unattended overnight runs)
  --dry-run            Print the first task and exit without invoking Claude
  --once               Process only one task
  --no-commit          Tell Claude not to create git commits
  --help               Show this message
`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readFile(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function findNextTask(queuePath) {
  const text = readFile(queuePath);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*-\s+\[\s\]\s+(.+?)\s*$/);
    if (match) {
      return { lineIndex: i, lineNumber: i + 1, text: match[1], raw: lines[i] };
    }
  }
  return null;
}

function isTaskStillOpen(queuePath, lineIndex, originalText) {
  const lines = readFile(queuePath).split(/\r?\n/);
  const line = lines[lineIndex] || "";
  const normalizedOriginal = originalText.trim();
  return line.includes("[ ]") && line.includes(normalizedOriginal);
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[`"'’”“]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "task";
}

function appendLog(file, text) {
  fs.appendFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
}

function writeStatus(statusPath, payload) {
  fs.writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function gitStatusShort() {
  const result = spawnSync("git", ["status", "--short"], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function buildPrompt({ root, queuePath, task, taskId, noCommit }) {
  const commitInstruction = noCommit
    ? "Do not create a git commit. Leave a clear diff summary instead."
    : "If this project is a git repository and you changed files, create a small git commit for this single task only.";

  return `You are Claude Code running a safe local task queue in this project:
${root}

Single queue item:
${task.text}

Queue file:
${queuePath}

Rules:
- Work on this one queue item only.
- Do not start any other queue item.
- Stop and report if the task requires secrets, passwords, API keys, payments, production deploy, DNS, destructive deletes, legal judgment, or owner taste/strategy decisions.
- Keep unrelated files untouched.
- Run the smallest useful verification for this task.
- Mark this exact queue line from "- [ ]" to "- [x]" only if the task is truly complete and verified.
- Write a proof packet to ".claude/queue/evidence/${taskId}.md".
- ${commitInstruction}

Proof packet must include:
- task text;
- files changed;
- checks run;
- result;
- remaining risks;
- commit hash if a commit was created.

If you cannot complete the task safely, do not mark it done. Write why to ".claude/queue/evidence/${taskId}.md" and stop.`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const root = process.cwd();
  const queuePath = path.resolve(root, args.queue);
  const queueDir = path.dirname(queuePath);
  const logDir = path.join(queueDir, "logs");
  const evidenceDir = path.join(queueDir, "evidence");
  const statusPath = path.join(queueDir, "status.json");
  const currentTaskPath = path.join(queueDir, "current-task.md");
  ensureDir(queueDir);
  ensureDir(logDir);
  ensureDir(evidenceDir);

  if (!fs.existsSync(queuePath)) {
    fs.writeFileSync(queuePath, `# Claude Code task queue

## Policy

- Work one item at a time.
- Stop on secrets, payments, production deploys, destructive actions, or unclear owner decisions.
- Mark an item done only after checks pass.

## Tasks

- [ ] Replace this example with a small, verifiable task.
`);
  }

  const startedAt = new Date();
  const deadlineMs = startedAt.getTime() + args.hours * 60 * 60 * 1000;
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDir, `${runId}.log`);
  let completed = 0;

  appendLog(logPath, `run_id=${runId}`);
  appendLog(logPath, `root=${root}`);
  appendLog(logPath, `queue=${queuePath}`);
  appendLog(logPath, `started_at=${startedAt.toISOString()}`);

  while (Date.now() < deadlineMs && completed < args.maxTasks) {
    const task = findNextTask(queuePath);
    if (!task) {
      writeStatus(statusPath, {
        state: "complete",
        reason: "queue_empty",
        completed,
        queue: queuePath,
        updated_at: new Date().toISOString(),
      });
      appendLog(logPath, "queue empty");
      return;
    }

    const taskId = `${String(completed + 1).padStart(2, "0")}-${slugify(task.text)}`;
    const prompt = buildPrompt({ root, queuePath, task, taskId, noCommit: args.noCommit });
    fs.writeFileSync(currentTaskPath, `# Current queue task

- line: ${task.lineNumber}
- id: ${taskId}
- text: ${task.text}
- started_at: ${new Date().toISOString()}
`);

    writeStatus(statusPath, {
      state: args.dryRun ? "dry_run" : "running",
      current_task: task.text,
      current_task_id: taskId,
      current_line: task.lineNumber,
      completed,
      queue: queuePath,
      log: logPath,
      updated_at: new Date().toISOString(),
    });

    appendLog(logPath, `\n--- task_start ${taskId} line=${task.lineNumber} ---`);
    appendLog(logPath, task.text);

    if (args.dryRun) {
      process.stdout.write(`Dry run: next task is line ${task.lineNumber}: ${task.text}\n`);
      return;
    }

    const claudeArgs = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--max-turns",
      String(args.maxTurns),
    ];
    if (args.skipPermissions) claudeArgs.push("--dangerously-skip-permissions");
    else if (args.permissionMode) claudeArgs.push("--permission-mode", args.permissionMode);

    const result = spawnSync(args.claudeBin, claudeArgs, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });

    appendLog(logPath, `exit_code=${result.status}`);
    if (result.stdout) appendLog(logPath, `stdout:\n${result.stdout}`);
    if (result.stderr) appendLog(logPath, `stderr:\n${result.stderr}`);

    if (result.error) {
      writeStatus(statusPath, {
        state: "stopped",
        reason: `failed_to_start_claude: ${result.error.message}`,
        current_task: task.text,
        completed,
        queue: queuePath,
        log: logPath,
        updated_at: new Date().toISOString(),
      });
      process.exitCode = 1;
      return;
    }

    if (result.status !== 0) {
      writeStatus(statusPath, {
        state: "stopped",
        reason: `claude_exit_${result.status}`,
        current_task: task.text,
        completed,
        queue: queuePath,
        log: logPath,
        updated_at: new Date().toISOString(),
      });
      process.exitCode = result.status || 1;
      return;
    }

    if (isTaskStillOpen(queuePath, task.lineIndex, task.text)) {
      writeStatus(statusPath, {
        state: "stopped",
        reason: "task_not_marked_done_after_claude_run",
        current_task: task.text,
        completed,
        git_status: gitStatusShort(),
        queue: queuePath,
        log: logPath,
        updated_at: new Date().toISOString(),
      });
      appendLog(logPath, "stop: task line is still open; refusing to continue");
      process.exitCode = 2;
      return;
    }

    completed += 1;
    appendLog(logPath, `--- task_done ${taskId} ---`);
    if (args.once) break;
  }

  writeStatus(statusPath, {
    state: "stopped",
    reason: completed >= args.maxTasks ? "max_tasks_reached" : args.once ? "once_done" : "time_budget_reached",
    completed,
    git_status: gitStatusShort(),
    queue: queuePath,
    log: logPath,
    updated_at: new Date().toISOString(),
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
