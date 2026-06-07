// Compute wall-clock and active working minutes from the current Claude
// Code session transcript, for the /done consulting flow.
//
// Wall clock = first to last timestamped event. Active time = sum of gaps
// between consecutive events, dropping any gap longer than IDLE_MIN minutes
// (you stepped away). Active is the number we bill on; wall and commit span
// are shown alongside for transparency.
//
// Usage: node scripts/consulting/session-hours.mjs [transcriptPath]
// Prints JSON: { wall_clock_min, active_min, events, transcript }

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const IDLE_MIN = 5;

function projectTranscriptDir() {
  // Claude Code stores a project's session transcripts under
  // ~/.claude/projects/<cwd with slashes replaced by dashes>/
  const slug = process.cwd().replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", slug);
}

function latestTranscript(dir) {
  let best = null;
  let bestMtime = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const full = join(dir, name);
    const m = statSync(full).mtimeMs;
    if (m > bestMtime) {
      bestMtime = m;
      best = full;
    }
  }
  return best;
}

function main() {
  const dir = projectTranscriptDir();
  let file = process.argv[2];
  if (!file) {
    try {
      file = latestTranscript(dir);
    } catch {
      file = null;
    }
  }
  if (!file) {
    console.log(JSON.stringify({ error: "no transcript found", dir }));
    return;
  }

  const times = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o && o.timestamp) {
        const t = new Date(o.timestamp).getTime();
        if (Number.isFinite(t)) times.push(t);
      }
    } catch {
      // ignore malformed lines
    }
  }
  times.sort((a, b) => a - b);

  if (times.length < 2) {
    console.log(
      JSON.stringify({ wall_clock_min: 0, active_min: 0, events: times.length, transcript: file }),
    );
    return;
  }

  const wall = (times[times.length - 1] - times[0]) / 60000;
  const idleMs = IDLE_MIN * 60000;
  let activeMs = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap <= idleMs) activeMs += gap;
  }

  console.log(
    JSON.stringify({
      wall_clock_min: Math.round(wall),
      active_min: Math.round(activeMs / 60000),
      events: times.length,
      transcript: file,
    }),
  );
}

main();
