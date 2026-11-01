// Update check for the PC app. Only looks at GitHub releases tagged `desktop-v*`, so it never mixes with the Android APK releases.
// It tells the user and opens the release page; it does not replace files by itself.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const REPO = "DeepuExplainsAi/ALWAYSWISPR";
const PREFIX = "desktop-v";

const parse = (v) => String(v).replace(/^\D+/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/** Newest non-draft desktop release that is newer than `current`, or null. Throws on network trouble. */
async function check(current, fetchFn = fetch) {
  const res = await fetchFn(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Wispr-Desktop" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(res.status === 403 ? "GitHub is limiting requests. Try again later." : `GitHub answered ${res.status}`);
  const best = (await res.json())
    .filter((r) => !r.draft && String(r.tag_name).startsWith(PREFIX))
    .map((r) => ({ version: r.tag_name.slice(PREFIX.length), notes: r.body || "", page: r.html_url, size: (r.assets || []).reduce((n, a) => n + (a.size || 0), 0) }))
    .sort((a, b) => (newer(a.version, b.version) ? -1 : 1))[0];
  return best && newer(best.version, current) ? best : null;
}

module.exports = { check, newer, REPO, PREFIX };
