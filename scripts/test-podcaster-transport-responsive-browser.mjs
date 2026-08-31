import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const PUBLIC_ROOT = new URL("../public/", import.meta.url);
const GROUP_ORDER = ["tools", "zoom", "playback", "view", "summary", "output"];
const VIEWPORT_CASES = [
  { width: 1440, height: 900, rows: [GROUP_ORDER] },
  { width: 1321, height: 900, rows: [GROUP_ORDER] },
  { width: 1320, height: 900, rows: [["tools", "zoom"], ["playback", "view", "summary", "output"]] },
  { width: 1024, height: 900, rows: [["tools", "zoom"], ["playback", "view", "summary", "output"]] },
  { width: 769, height: 900, rows: [["tools", "zoom"], ["playback", "view", "summary", "output"]] },
  { width: 768, height: 900, rows: [["tools"], ["zoom"], ["playback"], ["view", "summary", "output"]] },
  { width: 390, height: 900, rows: [["tools"], ["zoom"], ["playback"], ["view", "summary", "output"]] },
  { width: 1320, height: 650, rows: [["tools", "zoom"], ["playback", "view", "summary", "output"]] },
  { width: 1024, height: 480, rows: [["tools", "zoom"], ["playback", "view", "summary", "output"]] },
  { width: 390, height: 320, rows: [["tools"], ["zoom"], ["playback"], ["view", "summary", "output"]] }
];

function extractElementById(source, tagName, id) {
  const idIndex = source.indexOf(`id="${id}"`);
  assert.ok(idIndex >= 0, `No se encontró #${id} en podcaster.html.`);

  const openIndex = source.lastIndexOf(`<${tagName}`, idIndex);
  assert.ok(openIndex >= 0, `No se encontró la apertura <${tagName}> de #${id}.`);

  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tags.lastIndex = openIndex;
  let depth = 0;
  let match;
  while ((match = tags.exec(source))) {
    const isClosing = match[0].startsWith("</");
    depth += isClosing ? -1 : 1;
    if (depth === 0) return source.slice(openIndex, tags.lastIndex);
  }

  throw new Error(`No se encontró el cierre </${tagName}> de #${id}.`);
}

function sameRows(actual, expected, label) {
  assert.deepEqual(
    actual.map((row) => [...row].sort()),
    expected.map((row) => [...row].sort()),
    `${label}: los grupos no corresponden a la retícula esperada.`
  );
}

const [pageSource, bootstrapCss, fontAwesomeCss, solidFont, regularFont, brandsFont, headerCss, podcasterCss] = await Promise.all([
  readFile(new URL("podcaster.html", PUBLIC_ROOT), "utf8"),
  readFile(new URL("vendor/bootstrap/bootstrap.min.css", PUBLIC_ROOT), "utf8"),
  readFile(new URL("vendor/fontawesome/all.min.css", PUBLIC_ROOT), "utf8"),
  readFile(new URL("vendor/fontawesome/webfonts/fa-solid-900.woff2", PUBLIC_ROOT)),
  readFile(new URL("vendor/fontawesome/webfonts/fa-regular-400.woff2", PUBLIC_ROOT)),
  readFile(new URL("vendor/fontawesome/webfonts/fa-brands-400.woff2", PUBLIC_ROOT)),
  readFile(new URL("header.css", PUBLIC_ROOT), "utf8"),
  readFile(new URL("podcaster.css", PUBLIC_ROOT), "utf8")
]);

const shellHtml = extractElementById(pageSource, "section", "podcastVideoShell");
const harnessHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/bootstrap.css">
    <link rel="stylesheet" href="/fontawesome.css">
    <link rel="stylesheet" href="/header.css">
    <link rel="stylesheet" href="/podcaster.css">
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { background: #0f172a; }
      [data-test-workspace-filler] { width: 1px; height: 1200px; pointer-events: none; }
    </style>
  </head>
  <body class="is-snoopy-editor-light-theme">
    <div id="podcastVideoModal" class="floating-panel-modal snoopy-editor-modal">${shellHtml}</div>
  </body>
</html>`;

const routes = new Map([
  ["/", ["text/html", harnessHtml]],
  ["/bootstrap.css", ["text/css", bootstrapCss]],
  ["/fontawesome.css", ["text/css", fontAwesomeCss]],
  ["/webfonts/fa-solid-900.woff2", ["font/woff2", solidFont]],
  ["/webfonts/fa-regular-400.woff2", ["font/woff2", regularFont]],
  ["/webfonts/fa-brands-400.woff2", ["font/woff2", brandsFont]],
  ["/header.css", ["text/css", headerCss]],
  ["/podcaster.css", ["text/css", podcasterCss]]
]);

const server = createServer((request, response) => {
  const route = routes.get(new URL(request.url || "/", "http://127.0.0.1").pathname);
  if (!route) {
    response.writeHead(204);
    response.end();
    return;
  }
  const charset = route[0].startsWith("text/") ? "; charset=utf-8" : "";
  response.writeHead(200, { "content-type": `${route[0]}${charset}`, "cache-control": "no-store" });
  response.end(route[1]);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  await new Promise((resolve) => server.close(resolve));
  throw new Error(
    `No se pudo iniciar Chromium de Playwright. Ejecuta npx playwright install chromium.\n${error.message}`
  );
}

const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function preparePage(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const strip = document.getElementById("podcastPortraitStrip");
    if (strip) {
      strip.innerHTML = Array.from({ length: 12 }, (_, index) => `
        <article class="podcast-portrait-card">
          <strong>Retrato ${index + 1}</strong>
          <span>Personaje de prueba</span>
        </article>
      `).join("");
    }

    const main = document.querySelector(".podcast-studio-main");
    const inspector = document.getElementById("podcastStudioInspector");
    main?.insertAdjacentHTML("beforeend", '<div data-test-workspace-filler aria-hidden="true"></div>');
    inspector?.insertAdjacentHTML("beforeend", '<div data-test-workspace-filler aria-hidden="true"></div>');
  });
  await page.locator(".podcast-video-transport").waitFor({ state: "visible" });
}

async function readTransportGeometry(page) {
  return page.evaluate((groupOrder) => {
    const shell = document.getElementById("podcastVideoShell");
    const transport = shell?.querySelector(".podcast-video-transport");
    const footer = shell?.querySelector(".podcast-studio-footer");
    const portraitStrip = shell?.querySelector(".podcast-portrait-strip");
    const studio = shell?.querySelector(".podcast-studio-layout");
    if (!shell || !transport || !footer || !portraitStrip || !studio) return null;

    const groupNodes = Object.fromEntries(groupOrder.map((name) => [
      name,
      transport.querySelector(`:scope > .is-${name === "view" ? "view-controls" : name}`)
    ]));
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
        centerY: value.top + value.height / 2
      };
    };
    const groupRects = Object.fromEntries(
      Object.entries(groupNodes).map(([name, node]) => [name, node ? rect(node) : null])
    );

    const rowBuckets = [];
    Object.entries(groupRects)
      .sort((left, right) => left[1].centerY - right[1].centerY || left[1].left - right[1].left)
      .forEach(([name, box]) => {
        const bucket = rowBuckets.find((candidate) => Math.abs(candidate.centerY - box.centerY) <= 4);
        if (bucket) {
          bucket.names.push(name);
          bucket.centerY = (bucket.centerY * (bucket.names.length - 1) + box.centerY) / bucket.names.length;
        } else {
          rowBuckets.push({ centerY: box.centerY, names: [name] });
        }
      });

    const shellRect = rect(shell);
    const transportRect = rect(transport);
    const footerRect = rect(footer);
    const stripRect = rect(portraitStrip);
    const studioRect = rect(studio);
    const scrollCandidates = [footer, portraitStrip].map((node) => ({
      className: node.className,
      overflowX: getComputedStyle(node).overflowX,
      overflowY: getComputedStyle(node).overflowY,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight
    }));

    return {
      shell: shellRect,
      transport: transportRect,
      footer: footerRect,
      strip: stripRect,
      studio: studioRect,
      groups: groupRects,
      rows: rowBuckets.sort((left, right) => left.centerY - right.centerY).map((row) => row.names),
      transportClientWidth: transport.clientWidth,
      transportScrollWidth: transport.scrollWidth,
      shellClientWidth: shell.clientWidth,
      shellScrollWidth: shell.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      footerBeforeTransport: Boolean(footer.compareDocumentPosition(transport) & Node.DOCUMENT_POSITION_FOLLOWING),
      transportIsLastChromeSection: !Array.from(transport.parentElement.children).some((node) => {
        if (node === transport || node.matches("input[hidden]")) return false;
        return Boolean(transport.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
      scrollCandidates
    };
  }, GROUP_ORDER);
}

function assertGroupsContained(geometry, label) {
  const tolerance = 1.5;
  for (const name of GROUP_ORDER) {
    const box = geometry.groups[name];
    assert.ok(box, `${label}: falta el grupo ${name}.`);
    assert.ok(
      box.left >= geometry.transport.left - tolerance &&
      box.right <= geometry.transport.right + tolerance &&
      box.top >= geometry.transport.top - tolerance &&
      box.bottom <= geometry.transport.bottom + tolerance,
      `${label}: ${name} queda fuera del transporte: ${JSON.stringify({ box, transport: geometry.transport })}`
    );
  }

  for (let leftIndex = 0; leftIndex < GROUP_ORDER.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < GROUP_ORDER.length; rightIndex += 1) {
      const leftName = GROUP_ORDER[leftIndex];
      const rightName = GROUP_ORDER[rightIndex];
      const left = geometry.groups[leftName];
      const right = geometry.groups[rightName];
      const overlapX = Math.min(left.right, right.right) - Math.max(left.left, right.left);
      const overlapY = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
      assert.ok(
        overlapX <= 1 || overlapY <= 1,
        `${label}: ${leftName} y ${rightName} se superponen (${overlapX.toFixed(1)}×${overlapY.toFixed(1)} px).`
      );
    }
  }
}

function assertNoHorizontalOverflow(geometry, label) {
  assert.ok(
    geometry.transportScrollWidth <= geometry.transportClientWidth + 1,
    `${label}: el transporte desborda horizontalmente (${geometry.transportScrollWidth}/${geometry.transportClientWidth}).`
  );
  assert.ok(
    geometry.shellScrollWidth <= geometry.shellClientWidth + 1,
    `${label}: el shell desborda horizontalmente (${geometry.shellScrollWidth}/${geometry.shellClientWidth}).`
  );
  assert.ok(
    geometry.documentScrollWidth <= geometry.documentClientWidth + 1,
    `${label}: el documento desborda horizontalmente (${geometry.documentScrollWidth}/${geometry.documentClientWidth}).`
  );
}

function assertFooterAnchored(geometry, viewport, label, options = {}) {
  assert.ok(geometry.footerBeforeTransport, `${label}: Retratos debe estar antes del transporte en el DOM.`);
  assert.ok(geometry.transportIsLastChromeSection, `${label}: el transporte debe ser la última sección visible del shell.`);
  assert.ok(
    geometry.footer.bottom <= geometry.transport.top + 1.5,
    `${label}: Retratos invade el transporte.`
  );
  assert.ok(
    Math.abs(geometry.shell.bottom - geometry.transport.bottom) <= 2,
    `${label}: el transporte no está pegado al bottom del shell (${geometry.shell.bottom}/${geometry.transport.bottom}).`
  );
  assert.ok(
    geometry.transport.bottom <= viewport.height + 1 && geometry.transport.top >= -1,
    `${label}: el transporte queda fuera del viewport vertical.`
  );
  assert.ok(
    geometry.studio.top >= geometry.shell.top - 1 && geometry.studio.bottom <= geometry.footer.top + 1.5,
    `${label}: el workspace debe ocupar solamente el espacio anterior a Retratos.`
  );

  const portraitHeightCap = viewport.height < 600
    ? Math.min(viewport.height * 0.20, 120)
    : Math.min(viewport.height * 0.26, 220);
  assert.ok(
    geometry.strip.height <= portraitHeightCap + 2,
    `${label}: Retratos excede su límite vertical (${geometry.strip.height}/${portraitHeightCap}).`
  );
  if (options.expectPortraitScroll !== false) {
    assert.ok(
      geometry.scrollCandidates.some((candidate) =>
        ["auto", "scroll"].includes(candidate.overflowX) || ["auto", "scroll"].includes(candidate.overflowY)
      ),
      `${label}: Retratos debe conservar un contenedor de scroll propio.`
    );
  }
}

try {
  for (const testCase of VIEWPORT_CASES) {
    const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
    const label = `${testCase.width}×${testCase.height}`;
    try {
      await preparePage(page);
      const geometry = await readTransportGeometry(page);
      assert.ok(geometry, `${label}: no se pudo medir el editor.`);
      sameRows(geometry.rows, testCase.rows, label);
      assertGroupsContained(geometry, label);
      assertNoHorizontalOverflow(geometry, label);
      assertFooterAnchored(geometry, testCase, label);

      const initialBottom = geometry.transport.bottom;
      await page.evaluate(() => {
        const main = document.querySelector(".podcast-studio-main");
        const inspector = document.getElementById("podcastStudioInspector");
        if (main) main.scrollTop = 240;
        if (inspector) inspector.scrollTop = 180;
      });
      const afterScroll = await readTransportGeometry(page);
      assert.ok(
        Math.abs(afterScroll.transport.bottom - initialBottom) <= 1,
        `${label}: el scroll del workspace movió el transporte.`
      );

      await page.locator(".podcast-studio-footer").evaluate((node) => node.classList.add("is-footer-collapsed"));
      await page.waitForTimeout(350);
      const collapsed = await readTransportGeometry(page);
      assertFooterAnchored(collapsed, testCase, `${label} Retratos colapsado`, { expectPortraitScroll: false });

      await page.locator(".podcast-studio-layout").evaluate((node) => node.classList.add("is-inspector-collapsed"));
      const inspectorCollapsed = await readTransportGeometry(page);
      assertGroupsContained(inspectorCollapsed, `${label} inspector colapsado`);
      assertNoHorizontalOverflow(inspectorCollapsed, `${label} inspector colapsado`);
    } finally {
      await page.close();
    }
  }

  const modePage = await browser.newPage({ viewport: { width: 1024, height: 650 } });
  try {
    await preparePage(modePage);
    await modePage.locator(".snoopy-portrait-dock").evaluate((node) => {
      node.hidden = true;
    });
    const hiddenDockGeometry = await modePage.evaluate(() => {
      const shell = document.getElementById("podcastVideoShell")?.getBoundingClientRect();
      const transport = document.querySelector(".snoopy-transport-grid")?.getBoundingClientRect();
      const dock = document.querySelector(".snoopy-portrait-dock");
      return {
        display: dock ? getComputedStyle(dock).display : "missing",
        dockHeight: dock?.getBoundingClientRect().height ?? -1,
        shellBottom: shell?.bottom ?? -1,
        transportBottom: transport?.bottom ?? -1
      };
    });
    assert.equal(hiddenDockGeometry.display, "none", "video activo: Retratos debe estar oculto.");
    assert.equal(hiddenDockGeometry.dockHeight, 0, "video activo: Retratos no debe reservar altura.");
    assert.ok(
      Math.abs(hiddenDockGeometry.shellBottom - hiddenDockGeometry.transportBottom) <= 2,
      "video activo: ocultar Retratos no debe separar el transporte del bottom."
    );

    const modeCases = [
      {
        label: "reel mode",
        apply: () => {
          document.getElementById("podcastVideoShell")?.classList.add("is-reel-mode");
        }
      },
      {
        label: "audio-only mode",
        apply: () => {
          document.getElementById("podcastVideoShell")?.classList.add("podcast-video-shell--audio-only");
        }
      },
      {
        label: "mid theme",
        apply: () => {
          document.body.classList.remove("is-snoopy-editor-light-theme");
          document.body.classList.add("is-snoopy-editor-mid-theme");
          document.getElementById("podcastVideoShell")?.classList.add("is-editor-mid-theme");
        }
      },
      {
        label: "dark theme",
        apply: () => {
          document.body.classList.remove("is-snoopy-editor-light-theme", "is-snoopy-editor-mid-theme");
          document.getElementById("podcastVideoShell")?.classList.remove(
            "is-editor-light-theme",
            "is-editor-mid-theme"
          );
        }
      }
    ];

    for (const modeCase of modeCases) {
      await modePage.reload({ waitUntil: "networkidle" });
      await preparePage(modePage);
      await modePage.evaluate(modeCase.apply);
      await modePage.waitForTimeout(50);
      const geometry = await readTransportGeometry(modePage);
      assert.ok(geometry, `${modeCase.label}: no se pudo medir el editor.`);
      sameRows(
        geometry.rows,
        [["tools", "zoom"], ["playback", "view", "summary", "output"]],
        modeCase.label
      );
      assertGroupsContained(geometry, modeCase.label);
      assertNoHorizontalOverflow(geometry, modeCase.label);
      assertFooterAnchored(geometry, { width: 1024, height: 650 }, modeCase.label);
    }
  } finally {
    await modePage.close();
  }

  const fullscreenPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await preparePage(fullscreenPage);
    await fullscreenPage.evaluate(() => {
      const preview = document.querySelector(".podcast-video-preview");
      const transport = document.querySelector(".podcast-video-transport");
      const host = document.createElement("div");
      host.className = "podcast-stage-fullscreen-controls-host";
      host.dataset.testFullscreenHost = "true";
      host.style.width = "980px";
      host.style.maxWidth = "980px";
      preview.classList.add("is-stage-expanded");
      preview.append(host);
      transport.classList.add("is-attached-to-stage-fullscreen");
      host.append(transport);
    });

    const fullscreenIntermediate = await readTransportGeometry(fullscreenPage);
    sameRows(
      fullscreenIntermediate.rows,
      [["tools", "zoom"], ["playback", "view", "summary", "output"]],
      "fullscreen 980 px"
    );
    assertGroupsContained(fullscreenIntermediate, "fullscreen 980 px");
    assertNoHorizontalOverflow(fullscreenIntermediate, "fullscreen 980 px");

    await fullscreenPage.locator("[data-test-fullscreen-host]").evaluate((host) => {
      host.style.width = "720px";
      host.style.maxWidth = "720px";
    });
    await fullscreenPage.waitForTimeout(50);
    const fullscreenMobile = await readTransportGeometry(fullscreenPage);
    sameRows(
      fullscreenMobile.rows,
      [["tools"], ["zoom"], ["playback"], ["view", "summary", "output"]],
      "fullscreen 720 px"
    );
    assertGroupsContained(fullscreenMobile, "fullscreen 720 px");
    assertNoHorizontalOverflow(fullscreenMobile, "fullscreen 720 px");
  } finally {
    await fullscreenPage.close();
  }

  console.log(
    `Snoopy transport responsive browser geometry OK: ${VIEWPORT_CASES.length} viewports + hidden portrait dock + 4 modes/themes + fullscreen 980/720 px.`
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
