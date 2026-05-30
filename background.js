importScripts("config.js");

const STORAGE_KEYS = {
  sessionToken: "sessionToken",
  session: "session",
  passwords: "passwords",
  lastSyncAt: "lastSyncAt"
};

async function getStored(keys) {
  return chrome.storage.local.get(keys);
}

async function setStored(values) {
  return chrome.storage.local.set(values);
}

async function clearStored() {
  return chrome.storage.local.remove(Object.values(STORAGE_KEYS));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${FAMILY_VAULT_CONFIG.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function loginWithApiKey(apiKey) {
  const data = await apiFetch("/api/extension/login", {
    method: "POST",
    body: JSON.stringify({
      apiKey,
      deviceName: "Chrome extension",
      browserName: "Chrome"
    })
  });

  await setStored({
    [STORAGE_KEYS.sessionToken]: data.sessionToken,
    [STORAGE_KEYS.session]: data.session
  });

  return syncPasswords();
}

async function syncPasswords() {
  const { sessionToken } = await getStored([STORAGE_KEYS.sessionToken]);
  if (!sessionToken) {
    return { authenticated: false, passwords: [] };
  }

  const data = await apiFetch("/api/extension/passwords", {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });

  const passwords = Array.isArray(data.passwords) ? data.passwords : [];
  await setStored({
    [STORAGE_KEYS.passwords]: passwords,
    [STORAGE_KEYS.lastSyncAt]: new Date().toISOString()
  });

  return { authenticated: true, passwords };
}

function normalizeHost(value) {
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function findMatchingPasswords(pageUrl, passwords) {
  const pageHost = normalizeHost(pageUrl);
  if (!pageHost) return [];

  return passwords.filter((item) => {
    const itemHost = normalizeHost(item.websiteUrl || "");
    return itemHost && (pageHost === itemHost || pageHost.endsWith(`.${itemHost}`));
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "LOGIN_WITH_API_KEY") {
      sendResponse(await loginWithApiKey(message.apiKey));
      return;
    }

    if (message?.type === "SYNC_PASSWORDS") {
      sendResponse(await syncPasswords());
      return;
    }

    if (message?.type === "GET_STATE") {
      const stored = await getStored(Object.values(STORAGE_KEYS));
      sendResponse({
        authenticated: Boolean(stored.sessionToken),
        passwords: stored.passwords || [],
        session: stored.session || null,
        lastSyncAt: stored.lastSyncAt || null
      });
      return;
    }

    if (message?.type === "LOGOUT") {
      await clearStored();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "GET_MATCHES_FOR_PAGE") {
      const stored = await getStored([STORAGE_KEYS.passwords, STORAGE_KEYS.sessionToken]);
      let passwords = stored.passwords || [];
      if (stored.sessionToken && passwords.length === 0) {
        const synced = await syncPasswords();
        passwords = synced.passwords;
      }
      sendResponse({ matches: findMatchingPasswords(message.url || "", passwords) });
      return;
    }

    sendResponse({ error: "Unknown message" });
  })().catch((error) => {
    if (String(error.message || "").includes("Invalid session")) {
      clearStored();
    }
    sendResponse({ error: error.message || "Unexpected error" });
  });

  return true;
});
