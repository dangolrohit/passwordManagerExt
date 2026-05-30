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
    input.getAttribute("aria-label"),
    input.labels ? Array.from(input.labels).map((label) => label.textContent).join(" ") : ""
  ].join(" ").toLowerCase();

  let score = 0;
  if (haystack.includes("email")) score += 7;
  if (haystack.includes("user")) score += 6;
  if (haystack.includes("login")) score += 5;
  if (haystack.includes("phone")) score += 4;
  if (haystack.includes("account")) score += 3;
  if (input.autocomplete === "username" || input.autocomplete === "email") score += 8;
  if (input.type === "email") score += 7;
  if (input.type === "tel") score += 4;
  if (input.type === "text" || input.type === "") score += 2;
  if (input.disabled || input.readOnly) score -= 100;
  return score;
}

function scorePasswordField(input) {
  const haystack = [
    input.name,
    input.id,
    input.placeholder,
    input.autocomplete,
    input.getAttribute("aria-label"),
    input.labels ? Array.from(input.labels).map((label) => label.textContent).join(" ") : ""
  ].join(" ").toLowerCase();

  let score = visible(input) ? 10 : -100;
  if (input.autocomplete === "current-password") score += 15;
  if (haystack.includes("password")) score += 10;
  if (haystack.includes("new-password")) score -= 25;
  if (input.disabled || input.readOnly) score -= 100;
  return score;
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

function findLoginForm() {
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'))
    .map((input) => ({ input, score: scorePasswordField(input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const passwordInput = passwordInputs[0]?.input;
  if (!passwordInput) return null;

  const form = passwordInput.closest("form") || document;
  const scopeInputs = Array.from(form.querySelectorAll("input"));
  const allInputs = scopeInputs.length > 1 ? scopeInputs : Array.from(document.querySelectorAll("input"));

  const usernameInput = allInputs
    .filter((input) => input !== passwordInput && visible(input) && ["email", "text", "tel", "search", ""].includes(input.type))
    .map((input) => ({ input, score: scoreUsernameField(input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.input;

  return { passwordInput, usernameInput };
}

function autofill(matches) {
  if (!matches.length || document.documentElement.dataset[AUTOFILL_MARK] === "true") return;

  const loginForm = findLoginForm();
  if (!loginForm) return;

  const credential = chooseCredential(matches);

  setValue(loginForm.usernameInput, credential.email || credential.username || credential.phone || "");
  setValue(loginForm.passwordInput, credential.password || "");

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
      if (!findLoginForm()) return;
      const response = await sendMessage({
        type: "GET_MATCHES_FOR_PAGE",
        url: window.location.href,
        title: document.title
      });
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
