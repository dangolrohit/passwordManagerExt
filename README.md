# Family Vault Chrome Extension

Chrome extension for family members. It connects once with a one-time API key from the parent dashboard, shows how many passwords are assigned, and autofills matching login pages.

## Install Locally

1. Open Chrome and visit `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension` folder.
5. Click the Family Vault extension icon.
6. Paste a one-time API key generated from the parent dashboard.

## How Autofill Works

- The extension calls `POST /api/extension/login` with the one-time API key.
- It stores the returned extension session token in `chrome.storage.local`.
- It syncs assigned passwords from `GET /api/extension/passwords`.
- On each page, it detects whether a visible login form exists.
- It scores matching passwords by hostname, subdomain, platform name, page title, and domain tokens.
- If only one password is assigned, it can safely use that as a fallback when a login form is detected.
- It auto-detects username/email/phone and password fields using input type, labels, names, placeholders, and autocomplete hints.
- If a match is found, it fills the username/email/phone and password fields.

## Backend

Default API base URL is configured in `config.js`:

```js
https://pwmanager-sigma.vercel.app
```

Change this only if the production web app domain changes.
