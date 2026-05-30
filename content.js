const AUTOFILL_MARK = "familyVaultAutofilled";

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function visible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function scoreUsernameField(input) {
  const haystack = [
    input.name,
    input.id,
    input.placeholder,
    input.autocomplete,
    input.getAttribute("aria-label")
  ].join(" ").toLowerCase();

  if (haystack.includes("email")) return 5;
  if (haystack.includes("user")) return 4;
  if (haystack.includes("login")) return 3;
  if (input.type === "email") return 5;
  if (input.type === "text") return 2;
  return 0;
}

function setValue(input, value) {
  if (!input || !value) return;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function chooseCredential(matches) {
  return matches.find((item) => item.password && (item.username || item.email || item.phone)) || matches[0];
}

function autofill(matches) {
  if (!matches.length || document.documentElement.dataset[AUTOFILL_MARK] === "true") return;

  const passwordInput = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
  if (!passwordInput) return;

  const credential = chooseCredential(matches);
  const candidates = Array.from(document.querySelectorAll("input")).filter((input) => {
    return input !== passwordInput && visible(input) && ["email", "text", "tel", ""].includes(input.type);
  });

  const usernameInput = candidates
    .map((input) => ({ input, score: scoreUsernameField(input) }))
    .sort((a, b) => b.score - a.score)[0]?.input;

  setValue(usernameInput, credential.email || credential.username || credential.phone || "");
  setValue(passwordInput, credential.password || "");

  document.documentElement.dataset[AUTOFILL_MARK] = "true";
  showToast(`Filled ${credential.platformName || "saved password"}`);
}

function showToast(message) {
  const existing = document.getElementById("family-vault-toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.id = "family-vault-toast";
  toast.textContent = message;
  toast.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "padding:10px 12px",
    "border-radius:8px",
    "background:rgba(15,23,42,.86)",
    "color:white",
    "font:13px system-ui,sans-serif",
    "box-shadow:0 12px 40px rgba(0,0,0,.25)",
    "backdrop-filter:blur(14px)"
  ].join(";");

  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2400);
}

let debounceTimer;

async function runAutofill() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(async () => {
    try {
      const response = await sendMessage({ type: "GET_MATCHES_FOR_PAGE", url: window.location.href });
      if (response?.matches?.length) {
        autofill(response.matches);
      }
    } catch {
      // The extension may be logged out or unavailable on browser-internal pages.
    }
  }, 250);
}

runAutofill();

new MutationObserver(runAutofill).observe(document.documentElement, {
  childList: true,
  subtree: true
});
