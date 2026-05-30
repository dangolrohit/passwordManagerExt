const views = {
  login: document.getElementById("login-view"),
  vault: document.getElementById("vault-view")
};

const elements = {
  apiKey: document.getElementById("api-key"),
  connect: document.getElementById("connect"),
  loginMessage: document.getElementById("login-message"),
  count: document.getElementById("count"),
  countLabel: document.getElementById("count-label"),
  syncTime: document.getElementById("sync-time"),
  list: document.getElementById("password-list"),
  sync: document.getElementById("sync"),
  logout: document.getElementById("logout")
};

function message(payload) {
  return chrome.runtime.sendMessage(payload);
}

function show(name) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function pluralize(count) {
  return count === 1 ? "password saved" : "passwords saved";
}

function renderVault(state) {
  const passwords = state.passwords || [];
  elements.count.textContent = String(passwords.length);
  elements.countLabel.textContent = pluralize(passwords.length);
  elements.syncTime.textContent = state.lastSyncAt
    ? `Last synced ${new Date(state.lastSyncAt).toLocaleString()}`
    : "Ready to sync";

  elements.list.textContent = "";
  if (passwords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "message";
    empty.textContent = "No passwords have been shared with this family member yet.";
    elements.list.appendChild(empty);
  } else {
    passwords.forEach((item) => {
      const row = document.createElement("div");
      row.className = "item";

      const title = document.createElement("strong");
      title.textContent = item.platformName || "Saved password";

      const meta = document.createElement("span");
      meta.textContent = item.websiteUrl || item.email || item.username || "";

      row.append(title, meta);
      elements.list.appendChild(row);
    });
  }

  show("vault");
}

async function loadState() {
  const state = await message({ type: "GET_STATE" });
  if (state.authenticated) {
    renderVault(state);
  } else {
    show("login");
  }
}

elements.connect.addEventListener("click", async () => {
  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    elements.loginMessage.textContent = "Paste the one-time API key from the parent dashboard.";
    return;
  }

  elements.connect.disabled = true;
  elements.loginMessage.textContent = "Connecting...";
  try {
    const state = await message({ type: "LOGIN_WITH_API_KEY", apiKey });
    if (state.error) throw new Error(state.error);
    elements.apiKey.value = "";
    renderVault(state);
  } catch (error) {
    elements.loginMessage.textContent = error.message || "Could not connect.";
  } finally {
    elements.connect.disabled = false;
  }
});

elements.sync.addEventListener("click", async () => {
  elements.sync.disabled = true;
  try {
    const state = await message({ type: "SYNC_PASSWORDS" });
    if (state.error) throw new Error(state.error);
    renderVault({ ...state, lastSyncAt: new Date().toISOString() });
  } finally {
    elements.sync.disabled = false;
  }
});

elements.logout.addEventListener("click", async () => {
  await message({ type: "LOGOUT" });
  show("login");
});

loadState();
