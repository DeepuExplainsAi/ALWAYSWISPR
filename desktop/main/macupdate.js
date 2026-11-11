// In-app update for macOS. The Mac build is not code-signed, so the OS refuses electron-updater there.
// Instead: download the release's .zip, check its sha512 against latest-mac.yml, and swap the .app bundle after Wispr quits.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

/** The .app being run, or null (dev run, translocated or read-only location). */
function appBundle() {
  const m = /^(.*?\.app)\/Contents\//.exec(process.execPath);
  if (!m || m[1].includes("/AppTranslocation/") || m[1].startsWith("/Volumes/")) return null;
  try { fs.accessSync(path.dirname(m[1]), fs.constants.W_OK); } catch { return null; }
  return m[1];
}

/** Pulls the zip entry for this CPU out of latest-mac.yml (electron-builder's own format: url + sha512 + size). */
function pickZip(yml, arch) {
  const entries = [];
  let cur = null;
  for (const line of yml.split("\n")) {
    const u = /^\s*-?\s*url:\s*(\S+)/.exec(line);
    if (u) { cur = { url: u[1] }; entries.push(cur); continue; }
    const s = /^\s+sha512:\s*(\S+)/.exec(line);
    if (s && cur && !cur.sha512) cur.sha512 = s[1];
    const z = /^\s+size:\s*(\d+)/.exec(line);
    if (z && cur) cur.size = +z[1];
  }
  return entries.find((e) => e.url.endsWith(".zip") && e.url.includes(`mac-${arch}`)) || null;
}

/** Downloads + verifies. onProgress(0..100). Resolves the path of the new Wispr.app. */
async function download(base, onProgress, arch = process.arch) {
  const ymlRes = await fetch(`${base}latest-mac.yml`, { signal: AbortSignal.timeout(20000) });
  if (!ymlRes.ok) throw new Error("update list not found");
  const entry = pickZip(await ymlRes.text(), arch);
  if (!entry?.sha512) throw new Error("no Mac build in this release");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wispr-update-"));
  const zip = path.join(dir, "wispr.zip");
  const res = await fetch(base + encodeURI(entry.url), { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
  const total = entry.size || +res.headers.get("content-length") || 0;
  const hash = crypto.createHash("sha512");
  let done = 0;
  const tap = async function* (src) { for await (const c of src) { hash.update(c); done += c.length; if (total) onProgress(Math.min(99, Math.round((done * 100) / total))); yield c; } };
  await pipeline(Readable.fromWeb(res.body), tap, fs.createWriteStream(zip));
  if (hash.digest("base64") !== entry.sha512) throw new Error("the downloaded file failed its checksum");
  execFileSync("/usr/bin/ditto", ["-x", "-k", zip, dir]);
  fs.rmSync(zip, { force: true });
  const app = fs.readdirSync(dir).find((f) => f.endsWith(".app"));
  if (!app) throw new Error("the download has no app inside");
  return path.join(dir, app);
}

/** Replaces the running app once it has quit, then opens the new one. The caller quits right after. */
function install(newApp, target = appBundle()) {
  if (!target) throw new Error("Wispr is not in a writable Applications folder");
  const q = (s) => `'${s.replace(/'/g, "'\\''")}'`;
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
    `rm -rf ${q(target + ".old")}`,
    `mv ${q(target)} ${q(target + ".old")} || exit 1`,
    `if mv ${q(newApp)} ${q(target)}; then rm -rf ${q(target + ".old")}; else mv ${q(target + ".old")} ${q(target)}; fi`,
    `xattr -cr ${q(target)} 2>/dev/null`,
    `open ${q(target)}`,
  ].join("\n");
  spawn("/bin/sh", ["-c", script], { detached: true, stdio: "ignore" }).unref();
}

module.exports = { appBundle, pickZip, download, install };
