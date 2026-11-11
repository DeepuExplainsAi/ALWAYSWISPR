// Update check for the PC app. Desktop installers sit on the normal v* release next to the APK, so a release counts only if it has a desktop installer.
// check() finds the release; main.js downloads and installs it inside the app (electron-updater) where the OS allows it.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const REPO = "DeepuExplainsAi/ALWAYSWISPR";
const INSTALLER = /(win-x64\.exe|\.dmg|\.AppImage|\.deb)$/i;

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
    .filter((r) => !r.draft && (r.assets || []).some((a) => INSTALLER.test(a.name)))
    .map((r) => ({ version: r.tag_name.replace(/^\D+/, ""), notes: r.body || "", page: r.html_url, tag: r.tag_name, size: 0 }))
    .sort((a, b) => (newer(a.version, b.version) ? -1 : 1))[0];
  return best && newer(best.version, current) ? best : null;
}

module.exports = { check, newer, REPO };
