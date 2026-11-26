"use strict";

(() => {
  const gate = document.body.cloneNode(true);
  const genericTitle = document.title;
  const { revision, parts } = document.documentElement.dataset;
  const urls = new Map();
  let payload;
  let activeToken;
  let pending;
  let theme;
  let displayedLanguage;
  let navigation = 0;

  function gateMessage(en, ko) {
    document.title = genericTitle;
    document.documentElement.lang = "en";
    document.body.replaceWith(gate.cloneNode(true));
    if (en) document.getElementById("status-en").textContent = en;
    if (ko) document.getElementById("status-ko").textContent = ko;
  }

  function clearMaterials() {
    payload = undefined;
    activeToken = undefined;
    pending = undefined;
    displayedLanguage = undefined;
    theme?.remove();
    theme = undefined;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  }

  function bytes64(s) {
    return Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  }

  async function openMaterials(token) {
    const key = await crypto.subtle.importKey("raw",
      bytes64(token.replace(/-/g, "+").replace(/_/g, "/") + "=="), "AES-GCM", false, ["decrypt"]);
    const blocks = await Promise.all(Array.from({ length: Number(parts) }, async (_, i) => {
      const response = await fetch(`assets/${revision}/${i}.bin`, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw Error("Part unavailable");
      return response.arrayBuffer();
    }));
    const sealed = new Uint8Array(await new Blob(blocks).arrayBuffer());
    const gzip = await crypto.subtle.decrypt({
      name: "AES-GCM", iv: sealed.subarray(0, 12),
      additionalData: new TextEncoder().encode("jcou-reader-v1"), tagLength: 128
    }, key, sealed.subarray(12));
    const stream = new Blob([gzip]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).json();
  }

  function fileURL(path) {
    if (!urls.has(path)) {
      const [type, data] = payload.assets[path];
      urls.set(path, URL.createObjectURL(new Blob([bytes64(data)], { type })));
    }
    return urls.get(path);
  }

  function routeLink(token, lang, id) {
    if (lang === "en" && !id) return "#" + token;
    return "#" + token + "/" + lang + (id ? "/" + id : "");
  }

  function renderPage(token, lang) {
    const page = payload.pages[lang];
    const template = document.createElement("template");
    template.innerHTML = page.body;
    const fragment = template.content;
    for (const element of fragment.querySelectorAll("[src], [poster]")) {
      for (const attr of ["src", "poster"]) {
        if (element.hasAttribute(attr)) element.setAttribute(attr, fileURL(element.getAttribute(attr)));
      }
    }
    for (const link of fragment.querySelectorAll("a[href]")) {
      if (link.hasAttribute("data-lang")) continue;
      const path = link.getAttribute("href");
      if (path.startsWith("#")) {
        link.setAttribute("href", routeLink(token, lang, path.slice(1)));
      } else {
        link.setAttribute("href", fileURL(path));
        link.setAttribute("download", path.split("/").pop());
      }
    }
    document.documentElement.lang = lang;
    document.title = page.title;
    document.body.className = "";
    document.body.replaceChildren(fragment);
    displayedLanguage = lang;
  }

  async function navigate() {
    const current = ++navigation;
    const raw = location.hash.slice(1);
    const matched = /^([A-Za-z0-9_-]{22})(?:\/(en|ko)(?:\/([A-Za-z0-9_-]+))?)?$/.exec(raw);
    if (!matched) {
      clearMaterials();
      gateMessage();
      return;
    }
    const [, token, lang = "en", id] = matched;
    try {
      if (activeToken !== token) {
        clearMaterials();
        gateMessage("Opening the research materials…", "연구 자료를 여는 중입니다.");
        activeToken = token;
        pending = openMaterials(token);
      }
      if (!payload) {
        const opened = await pending;
        if (current !== navigation) return;
        payload = opened;
      }
      if (!theme) {
        theme = document.createElement("link");
        theme.rel = "stylesheet";
        const cssURL = URL.createObjectURL(new Blob([payload.css], { type: "text/css" }));
        urls.set("theme", cssURL);
        theme.href = cssURL;
        const applied = new Promise((resolve, reject) => {
          theme.onload = resolve;
          theme.onerror = reject;
        });
        document.head.append(theme);
        await applied;
        if (current !== navigation) return;
      }
      if (displayedLanguage !== lang) renderPage(token, lang);
      const target = id ? document.getElementById(id) : null;
      for (const link of document.querySelectorAll("a[data-lang]")) {
        link.setAttribute("href", routeLink(token, link.lang, target?.id));
      }
      if (target) {
        target.scrollIntoView();
        if (target.matches("[tabindex]")) target.focus({ preventScroll: true });
      } else {
        window.scrollTo(0, 0);
      }
    } catch {
      if (current !== navigation) return;
      clearMaterials();
      gateMessage(
        "The materials could not be opened. Open the complete manuscript link in an up-to-date browser and try again.",
        "자료를 열 수 없습니다. 최신 브라우저에서 논문에 실린 전체 링크를 다시 열어 주세요."
      );
    }
  }

  window.addEventListener("hashchange", navigate);
  navigate();
})();
