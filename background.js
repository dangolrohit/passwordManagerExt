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

function compact(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hostTokens(host) {
  return host
    .split(".")
    .filter((part) => part && !["www", "com", "net", "org", "io", "app", "co", "np"].includes(part));
}

function scorePasswordForPage(pageUrl, pageTitle, item, totalPasswords) {
  const pageHost = normalizeHost(pageUrl);
  if (!pageHost) return 0;

  const itemHost = normalizeHost(item.websiteUrl || "");
  const platform = compact(item.platformName);
  const pageTitleText = compact(pageTitle);
  const pageHostText = compact(pageHost);
  const itemHostText = compact(itemHost);
  let score = 0;

  if (itemHost && pageHost === itemHost) score += 100;
  if (itemHost && pageHost.endsWith(`.${itemHost}`)) score += 90;
  if (itemHost && itemHost.endsWith(`.${pageHost}`)) score += 80;
  if (itemHostText && pageHostText.includes(itemHostText)) score += 45;
  if (platform && pageHostText.includes(platform)) score += 35;
  if (platform && pageTitleText.includes(platform)) score += 25;

  for (const token of hostTokens(pageHost)) {
    if (platform && platform.includes(token)) score += 18;
    if (itemHostText && itemHostText.includes(token)) score += 18;
  }

  if (totalPasswords === 1 && score === 0) score = 10;
  return score;
}

function findMatchingPasswords(pageUrl, pageTitle, passwords) {
  return passwords
    .map((item) => ({
      ...item,
      matchScore: scorePasswordForPage(pageUrl, pageTitle, item, passwords.length)
    }))
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
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
      sendResponse({ matches: findMatchingPasswords(message.url || "", message.title || "", passwords) });
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
