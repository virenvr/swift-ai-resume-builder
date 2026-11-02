#!/usr/bin/env node
// One command for a new clone: npm install, .env.local, and Tectonic. Run with `npm run setup`.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const step = (msg) => console.log(`\n→ ${msg}`);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: isWin, cwd: root, ...opts });
  return res.status === 0;
}

function commandExists(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "ignore", shell: isWin, cwd: root });
  return res.status === 0;
}

const [nodeMajor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 20) {
  console.error(
    `Node ${process.versions.node} found, but swift-taylor needs Node 20+. Install it from ` +
      "https://nodejs.org, then re-run `npm run setup`.",
  );
  process.exit(1);
}

step("Installing npm dependencies...");
if (!run("npm", ["install"])) {
  console.error("npm install failed. Fix the error above, then re-run `npm run setup`.");
  process.exit(1);
}

const envExample = path.join(root, ".env.example");
const envLocal = path.join(root, ".env.local");
if (existsSync(envLocal)) {
  console.log("\n.env.local already exists — leaving it alone.");
} else {
  copyFileSync(envExample, envLocal);
  console.log(
    "\nCreated .env.local from .env.example. It starts in demo mode (no API key needed); " +
      "edit it later to add a real AI provider key. See the README's Configuration section.",
  );
}

step("Checking for Tectonic (the LaTeX engine used to compile PDFs)...");
if (commandExists("tectonic", ["--version"]) || existsSync(path.join(root, "tools/bin", isWin ? "tectonic.exe" : "tectonic"))) {
  console.log("Tectonic found. You're set.");
} else {
  console.log("Tectonic not found. Trying to install it automatically...");
  let installed = false;
  if (platform() === "darwin" && commandExists("brew", ["--version"])) {
    installed = run("brew", ["install", "tectonic"]);
  } else if (isWin && commandExists("winget", ["--version"])) {
    installed = run("winget", ["install", "-e", "--id", "TectonicTypesetting.Tectonic"]);
  }
  if (installed) {
    console.log("Tectonic installed.");
  } else {
    console.log(
      "Couldn't install it automatically (no Homebrew/winget found, or the install failed).\n" +
        "Install it yourself — see 'Installing Tectonic' in the README — then run `tectonic --version` " +
        "to confirm. The app runs without it, but PDF compiling will fail until it's installed.",
    );
  }
}

step("Setup finished. Run `npm run dev`, then open http://localhost:3000.");
