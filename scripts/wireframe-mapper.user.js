// ==UserScript==
// @name         Wireframe Mapper
// @namespace    https://github.com/b3ngous/wireframe-mapper
// @version      1.0.0
// @description  Generate wireframe mockups from live websites. Press Alt+W to trigger.
// @author       b3ngous
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @noframes
// ==/UserScript==

(() => {
	// Configuration
	const DEV_SERVER_URL = "http://localhost:9876/wireframe-mapper.js";
	const HOTKEY = { key: "w", altKey: true, ctrlKey: false, shiftKey: false };

	// State
	let isLoading = false;

	/**
	 * Fetch and execute the wireframe mapper script from dev server.
	 */
	async function runWireframeMapper() {
		if (isLoading) return;

		// Check if overlay already exists - if so, toggle it off
		const existing = document.getElementById("wireframe-mapper-overlay");
		if (existing) {
			existing.remove();
			console.log("[Wireframe Mapper] Overlay closed via userscript");
			return;
		}

		isLoading = true;
		console.log("[Wireframe Mapper] Fetching from dev server...");

		try {
			const code = await fetchScript(DEV_SERVER_URL);
			executeScript(code);
		} catch (err) {
			console.error("[Wireframe Mapper] Failed to load:", err.message);
			showError(err.message);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Fetch script from URL. Tries native fetch first (works for same-origin or CORS-enabled),
	 * falls back to GM_xmlhttpRequest if needed.
	 */
	async function fetchScript(url) {
		// Try native fetch first (simpler, works when CORS is enabled)
		try {
			const response = await fetch(url, { cache: "no-store" });
			if (response.ok) {
				return await response.text();
			}
		} catch (e) {
			console.log("[Wireframe Mapper] Native fetch failed, trying GM_xmlhttpRequest...", e.message);
		}

		// Fall back to GM_xmlhttpRequest
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: url,
				timeout: 5000,
				onload: (response) => {
					if (response.status === 200) {
						resolve(response.responseText);
					} else if (response.status === 0) {
						reject(new Error("Connection failed. Is dev server running on port 9876?"));
					} else {
						reject(new Error(`Server returned ${response.status}`));
					}
				},
				onerror: (response) => {
					console.error("[Wireframe Mapper] GM_xmlhttpRequest error:", response);
					reject(new Error("Cannot connect to dev server. Check if it is running on port 9876."));
				},
				ontimeout: () => {
					reject(new Error("Request timed out after 5s"));
				},
			});
		});
	}

	/**
	 * Execute the wireframe mapper script.
	 */
	function executeScript(code) {
		const script = document.createElement("script");
		script.textContent = code;
		document.documentElement.appendChild(script);
		script.remove();
	}

	/**
	 * Show error notification.
	 */
	function showError(message) {
		const toast = document.createElement("div");
		toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: #ef4444;
      color: white;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      max-width: 400px;
    `;
		toast.textContent = `Wireframe Mapper: ${message}`;
		document.body.appendChild(toast);

		setTimeout(() => toast.remove(), 4000);
	}

	/**
	 * Check if the key event matches our hotkey.
	 */
	function matchesHotkey(event) {
		return (
			event.key.toLowerCase() === HOTKEY.key &&
			event.altKey === HOTKEY.altKey &&
			event.ctrlKey === HOTKEY.ctrlKey &&
			event.shiftKey === HOTKEY.shiftKey
		);
	}

	// Register keyboard shortcut
	document.addEventListener("keydown", (event) => {
		if (matchesHotkey(event)) {
			event.preventDefault();
			event.stopPropagation();
			runWireframeMapper();
		}
	});

	// Register Tampermonkey menu commands
	GM_registerMenuCommand("Run Wireframe Mapper (Alt+W)", runWireframeMapper);

	console.log("[Wireframe Mapper] Userscript loaded. Press Alt+W to trigger.");
})();
