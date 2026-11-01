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
  $("openSettings").addEventListener("click", () => {
    $("hotkeyIn").value = showKey(S.hotkey); $("panelKeyIn").value = showKey(S.panelKey); $("autoSw").checked = !!S.autostart;
  });
