/**
 * jsonld-loader.js
 * Checks for existing JSON-LD on the page. If none is found,
 * fetches structured data from a remote service using the current
 * page name, then injects it as a <script type="application/ld+json"> tag.
 */

(async function () {
  const SERVICE_BASE_URL = "https://www.my-web-service.com";

  /**
   * Returns all existing JSON-LD script tags on the page.
   */
  function getExistingJsonLd() {
    return document.querySelectorAll('script[type="application/ld+json"]');
  }

  /**
   * Derives the current page name from the URL pathname.
   * e.g. "/products/shoes" → "shoes"
   *      "/"              → "home"
   */
  function getPageName() {
    const pathname = window.location.pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : "home";
  }

  /**
   * Fetches JSON-LD data from the remote service for the given page name.
   * Expects the service to return a JSON object (or array) of structured data.
   */
  async function fetchJsonLdFromService(pageName) {
    const url = `${SERVICE_BASE_URL}?page=${encodeURIComponent(pageName)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Service responded with ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Injects a JSON-LD <script> tag into the document <head>.
   */
  function injectJsonLd(data) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data, null, 2);
    document.head.appendChild(script);
    console.log("[jsonld-loader] JSON-LD injected:", data);
  }

  // ── Main logic ────────────────────────────────────────────────────────────

  const existing = getExistingJsonLd();

  if (existing.length > 0) {
    console.log(
      `[jsonld-loader] Found ${existing.length} existing JSON-LD block(s). Skipping fetch.`
    );
    return;
  }

  console.log("[jsonld-loader] No JSON-LD found. Fetching from service…");

  const pageName = getPageName();
  console.log(`[jsonld-loader] Page name: "${pageName}"`);

  try {
    const data = await fetchJsonLdFromService(pageName);
    injectJsonLd(data);
  } catch (err) {
    console.error("[jsonld-loader] Failed to fetch or inject JSON-LD:", err);
  }
})();
