import { openVideoProgressReport } from "./video-progress-report.js";

export function createVideoPlayerReviewManager(context = {}) {
  const {
    getDb,
    getAuth,
    getSession,
    setSession,
    getController,
    getRows,
    buildTimelineEntries,
    resolveActiveRow,
    getCurrentUserName,
    mutateProposalSession,
    mutateAllRows,
    loadFullSession,
    syncTransport,
    notifyActivity
  } = context;

  function getCurrentSession() {
    return typeof getSession === "function" ? getSession() : null;
  }

  function getCurrentUserActor() {
    const auth = typeof getAuth === "function" ? getAuth() : null;
    const user = auth?.currentUser || null;
    const nameSource = typeof getCurrentUserName === "function" ? getCurrentUserName() : "";

    if (!user) return null;

    return {
      uid: String(user.uid || "").trim(),
      name: String(nameSource || user.displayName || user.email || "").trim() || "Anónimo",
      email: String(user.email || "").trim()
    };
  }

  function buildSceneApprovalRecord(existing = null, approved = false) {
    const actor = getCurrentUserActor();
    return {
      ...(existing && typeof existing === "object" ? existing : {}),
      approved: Boolean(approved),
      approvedAt: new Date().toISOString(),
      approvedBy: actor || null
    };
  }

  function getCurrentSceneContext() {
    const session = getCurrentSession();
    const rows = typeof getRows === "function" ? getRows(session) : [];
    const entries = typeof buildTimelineEntries === "function" ? buildTimelineEntries(session) : [];
    const currentMs = Math.max(0, Number(getController?.()?.state.currentMs || 0));
    const activeEntry = entries.find((entry) => currentMs >= entry.startMs && currentMs < entry.endMs);
    const row = activeEntry ? (typeof resolveActiveRow === "function" ? resolveActiveRow(rows, activeEntry) : null) : null;
    const rowId = String(row?.id || activeEntry?.rowId || "").trim();

    return {
      row,
      rowId,
      activeEntry,
      sceneIndex: activeEntry ? Math.max(0, entries.findIndex((entry) => entry === activeEntry) + 1) : -1,
      rows
    };
  }

  async function refreshCurrentSession() {
    const session = getCurrentSession();
    const sessionId = String(session?.id || "").trim();
    if (!sessionId || typeof loadFullSession !== "function" || typeof getController !== "function") {
      return false;
    }

    const currentMs = Math.max(0, Number(getController().state.currentMs || 0));
    const freshSession = await loadFullSession(sessionId, session);
    if (!freshSession) return false;

    if (typeof setSession === "function") {
      setSession(freshSession);
    }

    const controller = getController();
    if (controller?.sync) {
      controller.sync(freshSession);
    }

    if (typeof syncTransport === "function") {
      syncTransport();
    }

    try {
      if (controller?.tick) {
        await controller.tick(currentMs);
      }
    } catch (err) {
      console.warn("[Dashboard] No se pudo reposicionar la reproducción al refrescar:", err);
    }

    return true;
  }

  async function openProgressReport() {
    const session = getCurrentSession();
    if (!session?.id) {
      alert("No hay una sesión activa para generar el reporte.");
      return;
    }

    try {
      await openVideoProgressReport({
        db: getDb ? getDb() : null,
        auth: getAuth ? getAuth() : null,
        session
      });
    } catch (err) {
      console.error("[Dashboard] Error al abrir reporte de progreso:", err);
      alert("No se pudo abrir el reporte de producción y revisión.");
    }
  }

  async function purgeVideoCache() {
    const session = getCurrentSession();
    if (!session?.id) {
      alert("No hay una sesión activa para refrescar.");
      return;
    }

    const controller = getController ? getController() : null;
    const btn = document.getElementById("btnPurgeVideoCache");
    const defaultIcon = btn ? btn.innerHTML : "";

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
    }

    try {
      const currentMs = Math.max(0, Number(controller?.state.currentMs || 0));
      await controller?.purgeAllMediaCaches();
      await refreshCurrentSession();
      if (controller?.tick) await controller.tick(currentMs);
      if (typeof syncTransport === "function") syncTransport();
    } catch (err) {
      console.error("[Dashboard] Error al refrescar sesión y limpiar caché:", err);
      alert("No se pudo actualizar sitio y recargar medios.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = defaultIcon || '<i class="fas fa-broom" aria-hidden="true"></i>';
      }
    }
  }

  async function toggleCurrentSceneApproval() {
    const context = getCurrentSceneContext();
    if (!context.rowId) {
      alert("No hay una escena activa para aprobar.");
      return;
    }

    const row = context.row;
    const nextApproved = !(row?.sceneApproval?.approved === true);
    const btn = document.getElementById("btnToggleSceneApproval");

    if (!mutateProposalSession) {
      alert("No se encontró el motor de persistencia para propuestas.");
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const result = await mutateProposalSession(context.rowId, (rows, rowIndex) => {
        const targetRow = rows?.[rowIndex];
        if (!targetRow) return false;
        targetRow.sceneApproval = buildSceneApprovalRecord(targetRow.sceneApproval, nextApproved);
        return true;
      });

      if (!result?.ok) {
        alert("No se encontró la escena actual para aprobar.");
        return;
      }

      await refreshCurrentSession();
      if (typeof notifyActivity === "function") {
        await notifyActivity(nextApproved ? "ha aprobado esta escena" : "ha desaprobado esta escena", result.rowIndex);
      }
    } catch (err) {
      console.error("[Dashboard] Error al cambiar estado de aprobación de escena:", err);
      alert("No se pudo actualizar el estado de aprobación.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function approveAllScenes() {
    const session = getCurrentSession();
    if (!session?.id) {
      alert("No hay sesión activa para aprobar escenas.");
      return;
    }

    const btn = document.getElementById("btnApproveAllScenes");
    const context = getCurrentSceneContext();
    const rows = Array.isArray(context?.rows) ? context.rows : [];

    if (!rows.length) {
      alert("No hay escenas para aprobar.");
      return;
    }

    if (!mutateAllRows) {
      alert("No se encontró el motor de persistencia para aprobar escenas.");
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const result = await mutateAllRows((sessionRows) => {
        if (!Array.isArray(sessionRows)) return false;
        sessionRows.forEach((sessionRow) => {
          if (!sessionRow || typeof sessionRow !== "object") return;
          sessionRow.sceneApproval = buildSceneApprovalRecord(sessionRow.sceneApproval, true);
        });
        return true;
      });

      if (!result?.ok) {
        alert("No se pudo aprobar todas las escenas.");
        return;
      }

      await refreshCurrentSession();
      if (typeof notifyActivity === "function") {
        await notifyActivity("aprobó todas las escenas de la sesión");
      }
    } catch (err) {
      console.error("[Dashboard] Error al aprobar todas las escenas:", err);
      alert("No se pudo aprobar todas las escenas.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function syncSceneApprovalUi(row = null) {
    const sceneApprovalBadge = document.getElementById("sceneApprovalBadge");
    const btn = document.getElementById("btnToggleSceneApproval");

    const isSceneApproved = Boolean(row?.sceneApproval?.approved === true);

    if (sceneApprovalBadge) {
      sceneApprovalBadge.hidden = !isSceneApproved;
    }

    if (btn) {
      btn.setAttribute("aria-pressed", isSceneApproved ? "true" : "false");
      btn.classList.toggle("is-approved", isSceneApproved);
      btn.title = isSceneApproved ? "Desaprobar escena" : "Aprobar escena";
      btn.setAttribute("aria-label", isSceneApproved ? "Desaprobar escena" : "Aprobar escena");
    }
  }

  function bindToolbarButtons() {
    const btnOpenProgress = document.getElementById("btnOpenProgressReport");
    const btnPurge = document.getElementById("btnPurgeVideoCache");
    const btnToggle = document.getElementById("btnToggleSceneApproval");
    const btnApproveAll = document.getElementById("btnApproveAllScenes");

    if (btnOpenProgress) btnOpenProgress.onclick = openProgressReport;
    if (btnPurge) btnPurge.onclick = purgeVideoCache;
    if (btnToggle) btnToggle.onclick = toggleCurrentSceneApproval;
    if (btnApproveAll) btnApproveAll.onclick = approveAllScenes;

    const btnCloseMonitor = document.getElementById("btnCloseSceneMonitor");
    const scenePanel = document.getElementById("playerSidePanel");
    const sideToggle = document.getElementById("btnToggleSceneInfo");
    if (btnCloseMonitor) {
      btnCloseMonitor.onclick = () => {
        if (scenePanel) scenePanel.classList.remove("is-open");
        if (sideToggle) sideToggle.classList.remove("active");
      };
    }
  }

  return {
    openProgressReport,
    purgeVideoCache,
    toggleCurrentSceneApproval,
    approveAllScenes,
    syncSceneApprovalUi,
    bindToolbarButtons
  };
}
