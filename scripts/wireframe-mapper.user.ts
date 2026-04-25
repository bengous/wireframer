export type GMResponse = {
  status: number;
  responseText: string;
};

type GMRequestArgs = {
  method: "GET" | "POST";
  url: string;
  timeout?: number;
  onload?: (response: GMResponse) => void;
  onerror?: (response: GMResponse) => void;
  ontimeout?: () => void;
};

declare function GM_xmlhttpRequest(args: GMRequestArgs): void;
declare function GM_registerMenuCommand(label: string, fn: () => void | Promise<void>): void;

((): void => {
  const DEV_SERVER_URL = "http://localhost:9876/wireframe-mapper.js";
  const HOTKEY = { key: "w", altKey: true, ctrlKey: false, shiftKey: false } as const;

  let isLoading = false;

  async function fetchScript(url: string): Promise<string> {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return await response.text();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log("[Wireframe Mapper] Native fetch failed, trying GM_xmlhttpRequest...", message);
    }

    return new Promise<string>((resolve, reject) => {
      const args: GMRequestArgs = {
        method: "GET",
        url,
        timeout: 5000,
        onload: (response: GMResponse) => {
          if (response.status === 200) {
            resolve(response.responseText);
          } else if (response.status === 0) {
            reject(new Error("Connection failed. Is dev server running on port 9876?"));
          } else {
            reject(new Error(`Server returned ${response.status}`));
          }
        },
        onerror: (response: GMResponse) => {
          console.error("[Wireframe Mapper] GM_xmlhttpRequest error:", response);
          reject(new Error("Cannot connect to dev server. Check if it is running on port 9876."));
        },
        ontimeout: () => {
          reject(new Error("Request timed out after 5s"));
        },
      };
      GM_xmlhttpRequest(args);
    });
  }

  function executeScript(code: string): void {
    const script = document.createElement("script");
    script.textContent = code;
    document.documentElement.appendChild(script);
    script.remove();
  }

  function showError(message: string): void {
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

  async function runWireframeMapper(): Promise<void> {
    if (isLoading) {
      return;
    }

    const existing = document.getElementById("wireframe-mapper-overlay");
    if (existing !== null) {
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
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Wireframe Mapper] Failed to load:", message);
      showError(message);
    } finally {
      isLoading = false;
    }
  }

  function matchesHotkey(event: KeyboardEvent): boolean {
    return (
      event.key.toLowerCase() === HOTKEY.key &&
      event.altKey === HOTKEY.altKey &&
      event.ctrlKey === HOTKEY.ctrlKey &&
      event.shiftKey === HOTKEY.shiftKey
    );
  }

  document.addEventListener("keydown", (event) => {
    if (matchesHotkey(event)) {
      event.preventDefault();
      event.stopPropagation();
      void runWireframeMapper();
    }
  });

  GM_registerMenuCommand("Run Wireframe Mapper (Alt+W)", runWireframeMapper);

  console.log("[Wireframe Mapper] Userscript loaded. Press Alt+W to trigger.");
})();
