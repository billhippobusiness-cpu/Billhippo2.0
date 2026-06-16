// Settings window logic. Talks to the main process via the `connector` bridge
// exposed by preload.js (contextIsolation is on, so no Node access here).

const $ = (id) => document.getElementById(id);

function render(state) {
  const on = !!state.signedIn;
  $("dot").classList.toggle("on", on);
  $("statusText").textContent = on ? "Connected to BillHippo" : "Not paired";
  $("pairCard").classList.toggle("hidden", on);
  $("pairedCard").classList.toggle("hidden", !on);
  if (state.settings) {
    $("host").value = state.settings.tallyHost;
    $("port").value = state.settings.tallyPort;
  }
}

async function refresh() {
  render(await window.connector.getState());
}

$("pairBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  const msg = $("pairMsg");
  if (!code) {
    msg.textContent = "Enter a pairing code.";
    msg.className = "msg err";
    return;
  }
  $("pairBtn").disabled = true;
  msg.textContent = "Pairing…";
  msg.className = "msg";
  const res = await window.connector.pair(code);
  if (res.ok) {
    msg.textContent = "Paired successfully.";
    msg.className = "msg ok";
    $("code").value = "";
  } else {
    msg.textContent = res.error || "Pairing failed.";
    msg.className = "msg err";
  }
  $("pairBtn").disabled = false;
  refresh();
});

$("unpairBtn").addEventListener("click", async () => {
  await window.connector.unpair();
  refresh();
});

$("saveBtn").addEventListener("click", async () => {
  await window.connector.saveSettings({
    tallyHost: $("host").value.trim() || "127.0.0.1",
    tallyPort: Number($("port").value) || 9000,
  });
  const msg = $("saveMsg");
  msg.textContent = "Saved.";
  msg.className = "msg ok";
  setTimeout(() => (msg.textContent = ""), 1500);
});

window.connector.onAuthChanged((state) => render({ ...state }));
refresh();
