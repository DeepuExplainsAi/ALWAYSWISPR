// AES-256-GCM at rest. The master key is random and wrapped by the OS keychain (Electron safeStorage) when available.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

let master = null;

/** Loads (or creates) the master key. `safe` = Electron safeStorage-like { isEncryptionAvailable, encryptString, decryptString }. */
function init(dir, safe) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "master.key");
  const wrap = safe?.isEncryptionAvailable?.();
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    master = Buffer.from(wrap ? safe.decryptString(raw) : raw.toString("utf8"), "base64");
    return;
  }
  master = crypto.randomBytes(32);
  const b64 = master.toString("base64");
  fs.writeFileSync(file, wrap ? safe.encryptString(b64) : b64, { mode: 0o600 });
}

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", master, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function decrypt(buf) {
  const d = crypto.createDecipheriv("aes-256-gcm", master, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

const encStr = (s) => encrypt(Buffer.from(s, "utf8"));
const decStr = (b) => decrypt(b).toString("utf8");

module.exports = { init, encrypt, decrypt, encStr, decStr };
