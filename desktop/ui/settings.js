  /* ---------- desktop: shortcuts + start with the computer (patched in by scripts/build-ui.js) ---------- */
  const MAC = /Mac/.test(navigator.platform);
  const KEYNAME = c => /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F\d{1,2}$/.test(c) ? c :
    ({ Space: "Space", Enter: "Enter", Tab: "Tab", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Backquote: "`" })[c] || "";
  const showKey = acc => (acc || "").replace("Control", "Ctrl").replace("Command", "⌘").replace("Super", MAC ? "⌘" : "Win");
  function shortcutField(id, key) {
    const el = $(id);
    el.onfocus = () => { el.value = "Press the keys…"; };
    el.onblur = () => { el.value = showKey(S[key]); };
    el.onkeydown = e => {
      e.preventDefault();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const k = KEYNAME(e.code);
      const mods = [e.ctrlKey && "Control", e.metaKey && (MAC ? "Command" : "Super"), e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
      if (!k || (!mods.length && !/^F\d/.test(k))) return toast("Hold Ctrl, Alt or " + (MAC ? "⌘" : "Win") + " together with a key");
      const acc = [...mods, k].join("+");
      if (N.setSetting(key, JSON.stringify(acc))) { S[key] = acc; toast("Shortcut saved: " + showKey(acc)); }
      else toast("Another app already uses that shortcut. Try a different one.");
      el.blur();
    };
  }
  shortcutField("hotkeyIn", "hotkey");
  shortcutField("panelKeyIn", "panelKey");
  $("autoSw").onchange = e => set("autostart", e.target.checked);
  /* ---------- update banner: slim bar at the very top of the app ---------- */
  const bar = document.createElement("div");
  bar.id = "updBanner"; bar.setAttribute("role", "status"); bar.hidden = true;
  bar.innerHTML = '<span id="ubText"></span><i id="ubProg"><b></b></i><button class="btn sm accent" id="ubGo"></button><button class="link" id="ubLater">Later</button>';
  document.body.prepend(bar);
  const ub = id => bar.querySelector("#" + id);
  function renderBanner() {
    const st = U.state || "idle", hasNew = !!U.latest;
    const busy = ["downloading", "installing"].includes(st);
    const show = hasNew && (U.skipped !== U.latest || busy || st === "ready" || st === "error");
    bar.hidden = !show; document.body.classList.toggle("hasUpd", show);
    if (!show) return;
    const v = "Wispr v" + U.latest;
    ub("ubText").textContent = st === "downloading" ? v + " is downloading… " + (U.progress || 0) + "%" :
      st === "ready" ? v + " is ready. Restart to finish the update." :
      st === "installing" ? "Installing " + v + "… Wispr restarts by itself." :
      st === "error" ? (U.msg || "Update failed.") : v + " is out.";
    ub("ubProg").style.display = busy ? "" : "none"; ub("ubProg").firstChild.style.width = (st === "downloading" ? U.progress || 0 : 100) + "%";
    ub("ubProg").classList.toggle("indet", st === "installing");
    const go = ub("ubGo"); go.hidden = busy; go.textContent = st === "ready" ? "Restart & update" : st === "error" ? "Try again" : "Update now";
    ub("ubLater").hidden = busy || st === "ready";
  }
  ub("ubGo").onclick = () => N.startUpdate();
  ub("ubLater").onclick = () => { if (U.latest) N.skipUpdate(U.latest); U.skipped = U.latest; renderBanner(); toast("OK, it stays in Settings → Updates"); };
  { const r = renderUpd; renderUpd = () => { r(); renderBanner(); }; }
  /* Groq's model list changed: refresh every picker */
  window.WisprModelsChanged = () => { try { S = JSON.parse(N.getSettings()); fillModels(); } catch {} };
  $("openSettings").addEventListener("click", () => {
    $("hotkeyIn").value = showKey(S.hotkey); $("panelKeyIn").value = showKey(S.panelKey); $("autoSw").checked = !!S.autostart;
  });
