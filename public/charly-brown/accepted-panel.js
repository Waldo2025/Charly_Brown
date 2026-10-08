import { installScriptCopyButtons } from "./video-script-copy.js";
import { escapeHtml } from "./ui-components.js";
import { getFocusedSya, getSyaGroupedByCategory, hasAllSelection } from "./sya-service.js";
import { isProjectSelection } from "./unit-contracts.js";
import { collectSessionBibliography } from "./bibliography.js";
import { normalizeActivitySubtopicTitle, cleanResourceSubtopicTitle } from "./activity-label.js";
import { initUnitDrawer, openActivityDrawer, openReadingDrawer, openResourceDrawer, openTeacherNotesDrawer, closeUnitDrawer, findFichaTeacherNote } from "./unit-drawer.js?v=20260928-fichas-tabs-6";


const COLLAPSE_PREFIX = "cbAcceptedCollapse:";
export function renderAcceptedPanel({
  root,
  session,
  isAutomating = false,
  automationProgress = null,
  readingOptions = [],
  readingFilter = "",
  onNewSession,
  onFilterReadings,
  onUseReading,
  onOpenReadingsPanel,
  onRemoveReading,
  onEditUnit,
  onRemoveUnit,
  onEditReadingSection,
  onEditActivity,
  onEditResource,
  onRegenerateActivity,
  onConvertActivityStyles,
  onRegenerateActivityStep,
  onRegenerateInfo,
  onAdjustActivityDifficulty,
  onImproveSya,
  onSaveSya,
  onRegenerateResource,
  onAdjustResourceDifficulty,
  onRemoveActivity,
  onRemoveResource,
  onOpenUnit,
  onGenerateResourcesForActivity,
  onGenerateNotesForActivity,
  onGenerateNotesForResource,
  onRegenerateTeacherNote,
  onGenerateGlobalNotes,
  onEditTeacherNotes,
  onDeleteTeacherNotes,
  onReorderActivities,
  onReorderResources,
  onReorderTeacherNotes
} = {}) {
  const panel = root?.querySelector("#cbAcceptedPanel");
  const globalBtn = root?.querySelector("#cbGenerateGlobalNotesBtn");
  if (!panel) return;

  if (globalBtn) globalBtn.onclick = () => onGenerateGlobalNotes?.();

  // Initialize Inspector Drawer
  initUnitDrawer(panel.ownerDocument || document);

  if (isAutomating) {
    renderAutomationSpinner(panel, automationProgress);
    return;
  }
  const units = Array.isArray(session?.units) ? session.units : [];
  if (!units.length) {
    panel.innerHTML = "";
    return;
  }
  panel.innerHTML = `${units.map((unit) => renderUnitPanel(unit, unit.id === session.activeUnitId, session)).join("")}${renderSessionBibliography(session)}`;
  bindItemDragAndDrop(panel, { onReorderActivities, onReorderResources, onReorderTeacherNotes });

  // Hook clicks on item cards to open Inspector Drawer
  panel.querySelectorAll("[data-activity-card-id]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".cb-card-menu, [data-activity-action]")) return;
      const unitId = card.dataset.unitId;
      const activityId = card.dataset.activityCardId;
      const targetUnit = units.find((u) => u.id === unitId) || session.units?.[0];
      const activity = targetUnit?.accepted?.activities?.find((a, idx) => a.id === activityId || String(idx) === activityId);
      if (activity) {
        if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
          closeUnitDrawer();
        } else {
          panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
          card.classList.add("is-active-item");
          openActivityDrawer({
            activity,
            mathActivities: (targetUnit.accepted.activities || []).filter((item) => normalize(item.subtopic) === normalize(activity.subtopic)),
            initialMathActivityIndex: (targetUnit.accepted.activities || []).filter((item) => normalize(item.subtopic) === normalize(activity.subtopic)).findIndex((item) => item.id === activity.id),
            unit: targetUnit,
            session,
            onEdit: (id, _unitId, nextHtml) => onEditActivity?.(id, unitId, nextHtml),
            onRegenerate: (id) => onRegenerateActivity?.(id, unitId),
            onRegenerateStep: (id, stepIndex) => onRegenerateActivityStep?.(id, unitId, stepIndex),
            onRegenerateInfo,
            onAdjustDifficulty: (id, difficulty, stepIndex) => onAdjustActivityDifficulty?.(id, unitId, difficulty, stepIndex),
            onImproveSya: (subtopic, category, fields, targetUnitId) => onImproveSya?.(targetUnitId, subtopic, category, fields),
            onSaveSya: (subtopic, fields, targetUnitId) => onSaveSya?.(targetUnitId, subtopic, fields),
            onRemove: (id) => onRemoveActivity?.(id, unitId),
            onRemoveResource: (id) => onRemoveResource?.(id, unitId),
            onNotes: (id) => onGenerateNotesForActivity?.(id, unitId),
            onAddResource: (id) => onGenerateResourcesForActivity?.(id, unitId)
          });
        }
      }
    });
  });

  panel.querySelectorAll("[data-reading-card-id]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".cb-card-menu, [data-reading-panel-action]")) return;
      const unitId = card.dataset.unitId;
      const targetUnit = units.find((u) => u.id === unitId) || session.units?.[0];
      const reading = targetUnit?.accepted?.reading;
      if (reading) {
        if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
          closeUnitDrawer();
        } else {
          panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
          card.classList.add("is-active-item");
          openReadingDrawer({
            reading,
            unit: targetUnit,
            session,
            onEdit: (part) => onEditReadingSection?.(part, unitId),
            onRemove: () => onRemoveReading?.(unitId)
          });
        }
      }
    });
  });

  panel.querySelectorAll("[data-resource-card-id]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".cb-card-menu, [data-resource-action]")) return;
      const unitId = card.dataset.unitId;
      const resourceId = card.dataset.resourceCardId;
      const targetUnit = units.find((u) => u.id === unitId) || session.units?.[0];
      const resource = targetUnit?.accepted?.resources?.find((r) => r.id === resourceId);
      if (resource) {
        if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
          closeUnitDrawer();
        } else {
          panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
          card.classList.add("is-active-item");
          {
            const resourcePages = (targetUnit?.accepted?.resources || []).filter((item) => normalize(item.subtopic) === normalize(resource.subtopic) && getResourceBadgeMeta(item).type === getResourceBadgeMeta(resource).type);
            openResourceDrawer({
              resource,
              resourcePages,
              initialResourcePageIndex: Math.max(0, resourcePages.findIndex((item) => item.id === resource.id)),
              activity: findResourceActivity(resource, targetUnit) || targetUnit?.accepted?.activities?.find((a) => a.id === resource.activityId),
              unit: targetUnit,
              session,
              onEdit: (id) => onEditResource?.(id, unitId),
              onRegenerate: (id) => onRegenerateResource?.(id, unitId),
              onAdjustDifficulty: (id, difficulty) => onAdjustResourceDifficulty?.(id, unitId, difficulty),
              onRemove: (id) => onRemoveResource?.(id, unitId) || window.handleRemoveResource?.(id, unitId),
              onRemoveResource: (id) => onRemoveResource?.(id, unitId) || window.handleRemoveResource?.(id, unitId)
            });
          }
        }
      }
    });
  });

  // Hook clicks on teacher notes item cards to open Inspector Drawer
  panel.querySelectorAll("[data-teacher-notes-card-id]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".cb-card-menu, [data-teacher-notes-action]")) return;
      const unitId = card.dataset.unitId;
      const activityId = card.dataset.activityId;
      const resourceId = card.dataset.resourceId;
      const isFichasGroup = card.dataset.isFichasGroup === "true";
      const noteId = card.dataset.teacherNotesCardId;
      const targetUnit = units.find((u) => u.id === unitId) || session.units?.[0];
      const projectMode = isProjectSelection(targetUnit?.meta || session || {});

      if (isFichasGroup) {
        const fichaResources = (targetUnit?.accepted?.resources || []).filter((r) => getResourceBadgeMeta(r).type === "ficha");
        if (fichaResources.length) {
          const fichaNotes = fichaResources.map((ficha, index) => {
            const note = findFichaTeacherNote(ficha, targetUnit, index);
            return {
              resource: ficha,
              note: note || null,
              title: formatFichaDisplayTitle(ficha, targetUnit, index)
            };
          });

          if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
            closeUnitDrawer();
          } else {
            panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
            card.classList.add("is-active-item");
            const firstEntry = fichaNotes[0];
            const hasAnyNotes = fichaNotes.some((fn) => fn.note && (fn.note.html || fn.note.content));
            openTeacherNotesDrawer({
              note: firstEntry.note || {
                id: firstEntry.note?.id || `ficha-${firstEntry.resource.id}`,
                resourceId: firstEntry.resource.id,
                title: `NDM: ${firstEntry.title}`,
                html: ""
              },
              resource: firstEntry.resource,
              fichaNotes,
              initialFichaNoteIndex: 0,
              initialTab: hasAnyNotes ? "notes" : "ficha",
              unit: targetUnit,
              session,
              title: fichaResources.length > 1 ? "NDM: Fichas de trabajo" : `NDM: ${firstEntry.title}`,
              noteHtml: firstEntry.note?.html || "",
              onSave: (id, html) => onEditTeacherNotes?.(id, html, unitId),
              onRegenerate: (id) => onGenerateNotesForResource?.(id, unitId) || onRegenerateResource?.(id, unitId),
              onNotes: (id) => onGenerateNotesForResource?.(id, unitId),
              onDelete: (id) => onDeleteTeacherNotes?.(id, unitId)
            });
          }
          return;
        }
      }

      if (activityId) {
        const activity = targetUnit?.accepted?.activities?.find((a, idx) => a.id === activityId || String(idx) === activityId || String(a.id) === String(activityId));
        const subtopicTitle = activity ? getActivityToggleLabel(activity, projectMode, targetUnit.meta?.category) : "Subtema";
        const note = (activity?.notes && activity.notes[0]) ||
          (targetUnit?.accepted?.teacherNotes || []).find((n) => (activity && n.activityId === activity.id) || n.id === noteId || (n.subtopic && activity?.subtopic && normalize(n.subtopic) === normalize(activity.subtopic))) ||
          (targetUnit?.accepted?.notes || []).find((n) => (activity && n.activityId === activity.id) || n.id === noteId) ||
          (targetUnit?.teacherNotes || []).find((n) => activity && n.activityId === activity.id);
        const siblingActivities = (targetUnit?.accepted?.activities || []).filter((item) => activity && normalize(item.subtopic) === normalize(activity.subtopic));
        const siblingNotes = [
          ...(targetUnit?.accepted?.teacherNotes || []).filter((entry) => activity && normalize(entry.subtopic) === normalize(activity.subtopic)),
          ...siblingActivities.flatMap((item) => item.notes || [])
        ];
        const mathNotes = siblingNotes.length
          ? siblingNotes.map((entry) => ({ activity: siblingActivities.find((item) => item.id === entry.activityId) || activity, note: entry }))
          : [{ activity, note: null }];

        if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
          closeUnitDrawer();
        } else {
          panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
          card.classList.add("is-active-item");
          openTeacherNotesDrawer({
            note: note || {
              title: `NDM: ${subtopicTitle}`,
              html: ""
            },
            mathNotes,
            initialMathNoteIndex: Math.max(0, mathNotes.findIndex((item) => item.note?.id === note?.id)),
            activity,
            unit: targetUnit,
            session,
            title: note?.title || `NDM: ${subtopicTitle}`,
            noteHtml: note?.html || note?.content || note?.text || "",
            onSave: (id, html) => onEditTeacherNotes?.(id, html, unitId),
            onRegenerate: (id) => note?.id ? onRegenerateTeacherNote?.(id, unitId) : onGenerateNotesForActivity?.(activity?.id || id, unitId),
            onNotes: (id) => onGenerateNotesForActivity?.(id || activity?.id, unitId),
            onDelete: (id) => onDeleteTeacherNotes?.(id, unitId)
          });
        }
        return;
      }

      if (resourceId) {
        const resource = targetUnit?.accepted?.resources?.find((r) => r.id === resourceId);
        if (resource) {
          const badgeMeta = getResourceBadgeMeta(resource);
          if (badgeMeta.type === "recortable") {
            // Los recortables no llevan nota de maestro separada
            return;
          }
          const fichaResources = badgeMeta.type === "ficha"
            ? (targetUnit?.accepted?.resources || []).filter((r) => getResourceBadgeMeta(r).type === "ficha")
            : [];
          const fichaNotes = fichaResources.map((ficha, index) => {
            const note = findFichaTeacherNote(ficha, targetUnit, index);
            return {
              resource: ficha,
              note: note || null,
              title: formatFichaDisplayTitle(ficha, targetUnit, index)
            };
          });
          const initialFichaNoteIndex = Math.max(0, fichaResources.findIndex((f) => f.id === resource.id));
          const selectedFicha = fichaNotes[initialFichaNoteIndex] || { resource, note: null, title: formatFichaDisplayTitle(resource, targetUnit, initialFichaNoteIndex) };

          if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
            closeUnitDrawer();
          } else {
            panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
            card.classList.add("is-active-item");
            const note = selectedFicha.note || findFichaTeacherNote(resource, targetUnit, initialFichaNoteIndex);
            openTeacherNotesDrawer({
              note: note || {
                id: note?.id || `ficha-${resource.id}`,
                resourceId: resource.id,
                title: `NDM: ${selectedFicha.title}`,
                html: ""
              },
              resource,
              fichaNotes,
              initialFichaNoteIndex,
              initialTab: "notes",
              unit: targetUnit,
              session,
              title: fichaResources.length > 1 ? "NDM: Fichas de trabajo" : `NDM: ${selectedFicha.title}`,
              noteHtml: note?.html || "",
              onSave: (id, html) => onEditTeacherNotes?.(id, html, unitId),
              onRegenerate: (id) => onGenerateNotesForResource?.(resource.id, unitId) || onRegenerateResource?.(resource.id, unitId),
              onDelete: (id) => onDeleteTeacherNotes?.(id, unitId)
            });
          }
          return;
        }
      }

      // Fallback: direct note from accepted.teacherNotes (excluyendo recortables)
      const note = targetUnit?.accepted?.teacherNotes?.find((n, idx) => n.id === noteId || String(idx) === noteId);
      if (note) {
        const noteTitleLower = String(note.title || "").toLowerCase();
        if (noteTitleLower.includes("recortable") || noteTitleLower.includes("cutout")) return;
        if (card.classList.contains("is-active-item") && !document.getElementById("cbInspectorPanelRoot")?.classList.contains("is-closed")) {
          closeUnitDrawer();
        } else {
          panel.querySelectorAll(".cb-up-item-card.is-active-item").forEach((el) => el.classList.remove("is-active-item"));
          card.classList.add("is-active-item");
          openTeacherNotesDrawer({
            note,
            mathNotes: (targetUnit?.accepted?.teacherNotes || []).filter((item) => normalize(item.subtopic) === normalize(note.subtopic)).map((item) => ({ activity: null, note: item })),
            initialMathNoteIndex: Math.max(0, (targetUnit?.accepted?.teacherNotes || []).filter((item) => normalize(item.subtopic) === normalize(note.subtopic)).findIndex((item) => item.id === note.id)),
            unit: targetUnit,
            session,
            title: note.title ? `NDM: ${note.title.replace(/^Nota del maestro:\s*/i, "")}` : "NDM: Notas del maestro",
            noteHtml: note.html || note.content || note.text || "",
            onSave: (id, html) => onEditTeacherNotes?.(id, html, unitId),
            onRegenerate: (id) => onRegenerateTeacherNote?.(id, unitId),
            onDelete: (id) => onDeleteTeacherNotes?.(id, unitId)
          });
        }
      }
    });
  });

  // Hook accordion branch group toggles (Actividades, Recursos, Notas)
  panel.querySelectorAll("[data-group-toggle]").forEach((header) => {
    header.addEventListener("click", () => {
      const groupKey = header.dataset.groupToggle;
      const branch = header.closest(".cb-up-organigram-branch");
      const itemsContainer = branch?.querySelector(`[data-group-items="${groupKey}"]`);
      if (!itemsContainer) return;

      const isNowHidden = !itemsContainer.hasAttribute("hidden") && itemsContainer.style.display !== "none";
      if (isNowHidden) {
        itemsContainer.setAttribute("hidden", "");
        itemsContainer.style.display = "none";
        header.setAttribute("aria-expanded", "false");
      } else {
        itemsContainer.removeAttribute("hidden");
        itemsContainer.style.display = "flex";
        header.setAttribute("aria-expanded", "true");
      }
      setCollapsedState(`group-${groupKey}`, isNowHidden);
    });
  });

  panel.querySelectorAll("[data-unit-toggle]").forEach((header) => {
    header.addEventListener("click", (e) => {
      if (e.target.closest("[data-unit-action]")) return;
      const unitId = header.dataset.unitToggle;
      const card = header.closest(".cb-up-unit-card");
      if (!card || !unitId) return;

      const isNowCollapsed = card.classList.toggle("is-collapsed");
      const sectionList = card.querySelector(".cb-up-section-list");
      if (sectionList) {
        sectionList.hidden = isNowCollapsed;
      }
      header.setAttribute("aria-expanded", isNowCollapsed ? "false" : "true");
      setCollapsedState(`unit-card-${unitId}`, isNowCollapsed);

      if (!isNowCollapsed && unitId !== session.activeUnitId) {
        onOpenUnit?.(unitId);
      }
    });
  });

  panel.querySelectorAll("[data-reading-panel-action='open']").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      onOpenReadingsPanel?.();
    });
  });
  panel.querySelectorAll("[data-reading-panel-action='remove']").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (unitId) onRemoveReading?.(unitId);
    });
  });
  panel.querySelector("[data-sya-panel-action='open']")?.addEventListener("click", () => {
    root?.dispatchEvent(new CustomEvent("cb:sya-edit"));
  });
  panel.querySelectorAll("[data-unit-action='new']").forEach((button) => {
    button.addEventListener("click", () => onNewSession?.());
  });
  panel.querySelectorAll("[data-unit-action='open']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (!id) return;
      onOpenUnit?.(id);
    });
  });
  panel.querySelectorAll("[data-unit-action='edit']").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (id) onEditUnit?.(id);
    });
  });
  panel.querySelectorAll("[data-unit-action='remove']").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (id) onRemoveUnit?.(id);
    });
  });
  panel.querySelectorAll("[data-activity-action]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      button.closest("details")?.removeAttribute("open");
      const id = button.closest("[data-activity-id], [data-activity-card-id]")?.dataset.activityId || button.closest("[data-activity-card-id]")?.dataset.activityCardId || "";
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (button.dataset.activityAction === "sya") {
        const activity = units.find((unit) => unit.id === unitId)?.accepted?.activities?.find((item) => item.id === id);
        if (activity) root?.dispatchEvent(new CustomEvent("cb:sya-edit", { detail: { unitId, category: activity.category || "", subtopic: activity.subtopic || activity.section || "" } }));
      }
      if (button.dataset.activityAction === "edit") onEditActivity?.(id, unitId);
      if (button.dataset.activityAction === "regenerate") onRegenerateActivity?.(id, unitId);
      if (button.dataset.activityAction === "convert-styles") onConvertActivityStyles?.(id, unitId);
      if (button.dataset.activityAction === "remove") onRemoveActivity?.(id, unitId);
      if (button.dataset.activityAction === "notes") onGenerateNotesForActivity?.(id, unitId);
      if (button.dataset.activityAction === "add-resource") onGenerateResourcesForActivity?.(id, unitId);
    });
  });
  panel.querySelectorAll("[data-resource-action]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      button.closest("details")?.removeAttribute("open");
      const card = button.closest("[data-resource-id], [data-resource-card-id]");
      const id = card?.dataset.resourceId || card?.dataset.resourceCardId || card?.dataset.sortableId || "";
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (button.dataset.resourceAction === "edit") onEditResource?.(id, unitId);
      if (button.dataset.resourceAction === "regenerate") onRegenerateResource?.(id, unitId);
      if (button.dataset.resourceAction === "notes") onGenerateNotesForResource?.(id, unitId);
      if (button.dataset.resourceAction === "remove") {
        if (confirm("¿Eliminar este recurso permanentemente?")) {
          if (typeof onRemoveResource === "function") {
            onRemoveResource(id, unitId);
          } else if (typeof window.handleRemoveResource === "function") {
            window.handleRemoveResource(id, unitId);
          }
        }
      }
    });
  });
  panel.querySelectorAll(".cb-card-menu > summary").forEach((summary) => {
    summary.addEventListener("click", (e) => {
      e.stopPropagation();
      const activeMenu = summary.parentElement;
      panel.querySelectorAll(".cb-card-menu[open]").forEach((menu) => {
        if (menu !== activeMenu) menu.removeAttribute("open");
      });
      requestAnimationFrame(() => {
        if (activeMenu?.open) positionCardMenu(activeMenu);
      });
    });
  });
  panel.onscroll = () => {
    panel.querySelectorAll(".cb-card-menu[open]").forEach((menu) => menu.removeAttribute("open"));
  };
  panel.querySelectorAll("[data-teacher-notes-action]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = button.closest("[data-teacher-notes-id]");
      const id = card?.dataset.teacherNotesId || "";
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (button.dataset.teacherNotesAction === "save") {
        const editable = card?.querySelector(".cb-teacher-notes-editable");
        const html = editable?.innerHTML ?? "";
        onEditTeacherNotes?.(id, html, unitId);
      }
      if (button.dataset.teacherNotesAction === "delete") onDeleteTeacherNotes?.(id, unitId);
    });
  });
  panel.querySelectorAll("[data-collapse-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (unitId && unitId !== session.activeUnitId) onOpenUnit?.(unitId);
      const key = button.dataset.collapseToggle || "";
      const shell = button.closest("[data-collapse-shell]");
      if (!shell || !key) return;
      const next = shell.dataset.collapsed !== "true";
      shell.dataset.collapsed = next ? "true" : "false";
      button.setAttribute("aria-expanded", next ? "false" : "true");
      setCollapsedState(key, next);
    });
  });
  panel.querySelectorAll("[data-approved-card-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const shell = button.closest("[data-approved-card-shell]");
      const key = shell?.dataset.approvedCardShell || "";
      if (!shell || !key) return;
      const next = shell.dataset.cardCollapsed !== "true";
      shell.dataset.cardCollapsed = next ? "true" : "false";
      button.setAttribute("aria-expanded", next ? "false" : "true");
      setCollapsedState(`approved-card-${key}`, next);
    });
  });
}

function installApprovedContentActions(panel, { onEditReadingSection, onEditActivity, onEditResource } = {}) {
  installScriptCopyButtons(panel);
  panel.querySelectorAll(".cb-approved-html, .cb-reading-content-section, .cb-bibliography-groups").forEach((content) => {
    if (content.querySelector(":scope > .cb-content-actions")) return;
    content.classList.add("cb-content-action-host");
    const row = document.createElement("div");
    row.className = "cb-content-actions";
    const editable = Boolean(content.dataset.readingPart || content.closest("[data-activity-id], [data-resource-id], [data-teacher-notes-id]"));
    row.innerHTML = `
      <button type="button" class="cb-content-action-button" data-content-command="copy" aria-label="Copiar contenido para Word" title="Copiar contenido para Word"><i class="far fa-copy" aria-hidden="true"></i></button>
      ${editable ? `<button type="button" class="cb-content-action-button" data-content-command="edit" aria-label="Editar contenido" title="Editar contenido"><i class="fas fa-pen" aria-hidden="true"></i></button>` : ""}
    `;
    content.append(row);
    row.querySelector("[data-content-command='copy']")?.addEventListener("click", async () => {
      const button = row.querySelector("[data-content-command='copy']");
      try {
        await copyContentForWord(content);
        button?.classList.add("is-copied");
        if (button) {
          button.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i>`;
          button.title = "Contenido copiado";
        }
        window.setTimeout(() => {
          if (!button) return;
          button.classList.remove("is-copied");
          button.innerHTML = `<i class="far fa-copy" aria-hidden="true"></i>`;
          button.title = "Copiar contenido para Word";
        }, 1800);
      } catch (_) {
        if (button) button.title = "No fue posible copiar el contenido";
      }
    });
    row.querySelector("[data-content-command='edit']")?.addEventListener("click", () => {
      const unitId = content.closest("[data-unit-id]")?.dataset.unitId || "";
      const activityId = content.closest("[data-activity-id]")?.dataset.activityId || "";
      const resourceId = content.closest("[data-resource-id]")?.dataset.resourceId || "";
      const notes = content.closest("[data-teacher-notes-id]");
      if (content.dataset.readingPart) onEditReadingSection?.(content.dataset.readingPart, unitId);
      else if (activityId) onEditActivity?.(activityId, unitId);
      else if (resourceId) onEditResource?.(resourceId, unitId);
      else if (notes) content.focus();
    });
  });
}

async function copyContentForWord(content) {
  const clone = content.cloneNode(true);
  clone.querySelector(".cb-content-actions")?.remove();
  const html = `<div style="font-family:Aptos,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#172033">${clone.innerHTML}</div>`;
  const text = structuredContentText(clone);
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    })]);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function structuredContentText(activity) {
  const output = [];
  activity.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,tr").forEach((node) => {
    const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (node.matches("li")) {
      const ordered = node.parentElement?.matches("ol");
      const index = ordered ? Array.from(node.parentElement.children).indexOf(node) + 1 : 0;
      output.push(`${ordered ? `${index}.` : "•"} ${text}`);
    } else if (node.matches("tr")) {
      output.push(Array.from(node.querySelectorAll("th,td")).map((cell) => String(cell.innerText || cell.textContent || "").trim()).join("\t"));
    } else if (!node.closest("li,tr")) {
      output.push(text);
    }
  });
  return output.join("\n\n");
}

const SUBTOPIC_CANONICAL_ORDER = [
  "artes",
  "ortografia",
  "gramatica",
  "expresionescrita",
  "trazosdeletras",
  "comprensionlectora",
  "expresionoral",
  "socioemocional",
  "conocimientodelmedio",
  "milocalidad",
  "naturales",
  "historia",
  "geografia",
  "civicaetica",
  "habilidades",
  "dictado",
  "matematicas"
];

function sortActivitiesBySubtopicOrder(activities = []) {
  if (!Array.isArray(activities)) return [];
  if (activities.some((activity) => Number.isFinite(Number(activity.displayOrder)))) {
    return [...activities].sort((a, b) => {
      const orderA = Number.isFinite(Number(a.displayOrder)) ? Number(a.displayOrder) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b.displayOrder)) ? Number(b.displayOrder) : Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }
  return [...activities].sort((a, b) => {
    const keyA = String(a.subtopic || a.title || "").toLowerCase().replace(/[\s:_()-]+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const keyB = String(b.subtopic || b.title || "").toLowerCase().replace(/[\s:_()-]+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let idxA = SUBTOPIC_CANONICAL_ORDER.findIndex((k) => keyA.includes(k));
    let idxB = SUBTOPIC_CANONICAL_ORDER.findIndex((k) => keyB.includes(k));

    if (idxA === -1) idxA = 999;
    if (idxB === -1) idxB = 999;

    return idxA - idxB;
  });
}

function isProjectsActivity(activity = {}) {
  return [activity.subtopic, activity.category, activity.section]
    .some((value) => /(^|[^a-z])proyectos?([^a-z]|$)/i.test(String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()));
}

function bindItemDragAndDrop(panel, callbacks = {}) {
  panel.__cbItemDragCallbacks = callbacks;
  if (panel.dataset.cbItemDragBound === "true") return;
  panel.dataset.cbItemDragBound = "true";
  let draggedCard = null;

  panel.addEventListener("dragstart", (event) => {
    const card = event.target.closest?.(".cb-up-item-card[data-sortable-type]");
    if (!card || event.target.closest("button, a, input, textarea, select") || card.dataset.sortableType === "reading") {
      event.preventDefault();
      return;
    }
    draggedCard = card;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.sortableId || "");
  });

  panel.addEventListener("dragover", (event) => {
    const target = event.target.closest?.(".cb-up-item-card[data-sortable-type]");
    if (!draggedCard || !target || target === draggedCard || target.parentElement !== draggedCard.parentElement || target.dataset.sortableType !== draggedCard.dataset.sortableType) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    target.classList.add("is-drop-target");
    const insertAfter = event.clientY >= target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    target.parentElement.insertBefore(draggedCard, insertAfter ? target.nextSibling : target);
  });

  panel.addEventListener("dragleave", (event) => {
    event.target.closest?.(".cb-up-item-card.is-drop-target")?.classList.remove("is-drop-target");
  });

  panel.addEventListener("drop", (event) => {
    const target = event.target.closest?.(".cb-up-item-card[data-sortable-type]");
    if (!draggedCard || !target || target.parentElement !== draggedCard.parentElement) return;
    event.preventDefault();
    const type = draggedCard.dataset.sortableType;
    const group = draggedCard.parentElement;
    const ids = Array.from(group.querySelectorAll(`:scope > .cb-up-item-card[data-sortable-type="${type}"]`))
      .flatMap((card) => {
        try { return JSON.parse(card.dataset.sortableIds || "[]"); } catch (_) { return [card.dataset.sortableId]; }
      })
      .filter(Boolean);
    const unitId = draggedCard.dataset.unitId || "";
    const currentCallbacks = panel.__cbItemDragCallbacks || {};
    if (type === "activity") currentCallbacks.onReorderActivities?.(unitId, ids);
    else if (type === "resource") currentCallbacks.onReorderResources?.(unitId, ids);
    else if (type === "teacher-note") currentCallbacks.onReorderTeacherNotes?.(unitId, ids);
    panel.__cbDraggedAt = Date.now();
  });

  panel.addEventListener("dragend", () => {
    panel.querySelectorAll(".is-dragging, .is-drop-target").forEach((card) => card.classList.remove("is-dragging", "is-drop-target"));
    draggedCard = null;
  });

  panel.addEventListener("click", (event) => {
    if (Date.now() - Number(panel.__cbDraggedAt || 0) > 500) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panel.__cbDraggedAt = 0;
  }, true);
}

function renderUnitPanel(unit = {}, active = false, session = {}) {
  const accepted = unit.accepted || {};
  const rawActivities = Array.isArray(accepted.activities) ? accepted.activities : [];
  const activities = sortActivitiesBySubtopicOrder(rawActivities);
  const resources = Array.isArray(accepted.resources) ? accepted.resources : [];
  const notes = Array.isArray(accepted.teacherNotes) ? accepted.teacherNotes : [];
  const projectMode = isProjectSelection(unit.meta || {});
  const namedProjectActivities = activities.filter(isProjectsActivity);
  const projectActivities = projectMode && !namedProjectActivities.length ? activities : namedProjectActivities;
  const projectActivitySet = new Set(projectActivities);
  const remainingActivities = activities.filter((activity) => !projectActivitySet.has(activity));
  const heading = buildUnitHeading(unit);
  const unitId = unit.id || "";
  const isCollapsed = getCollapsedState(`unit-card-${unitId}`, !active);
  const activitiesCollapsed = getCollapsedState(`group-activities-${unitId}`, false);
  const resourcesCollapsed = getCollapsedState(`group-resources-${unitId}`, false);
  const notesCollapsed = getCollapsedState(`group-notes-${unitId}`, false);

  const fichaCount = resources.filter((r) => getResourceBadgeMeta(r).type === "ficha").length;
  const visibleActivityNotesCount = groupActivitiesForPanel(activities).length;
  const orphanNotesCount = new Set(notes.filter((note) => {
    const title = String(note.title || "").toLowerCase();
    return !title.includes("recortable") && !title.includes("cutout")
      && !activities.some((activity) => normalize(activity.subtopic) === normalize(note.subtopic));
  }).map((note) => normalize(note.subtopic || note.title || note.id))).size;
  const totalNotesCount = visibleActivityNotesCount + (fichaCount > 0 ? 1 : 0) + orphanNotesCount;
  const visibleActivityGroups = groupActivitiesForPanel(remainingActivities);
  const activitiesBranch = `
    <div class="cb-up-organigram-branch cb-up-organigram-branch--activities">
      <div class="cb-up-group-header" data-group-toggle="activities-${escapeHtml(unitId)}" role="button" tabindex="0" aria-expanded="${activitiesCollapsed ? "false" : "true"}">
        <div class="cb-up-group-header-left">
          <span class="cb-up-group-title">Actividades</span>
          <span class="cb-up-group-count">${visibleActivityGroups.length}</span>
        </div>
        <i class="fas fa-chevron-down cb-up-group-chevron" aria-hidden="true"></i>
      </div>
      <div class="cb-up-group-items" data-group-items="activities-${escapeHtml(unitId)}"${activitiesCollapsed ? ' hidden style="display:none;"' : ""}>
        ${visibleActivityGroups.length ? visibleActivityGroups.map((group) => renderActivityItemCard(group[0], unit, projectMode, activities.indexOf(group[0]), group)).join("") : '<div class="cb-empty-hint">Sin actividades aprobadas aún.</div>'}
      </div>
    </div>
  `;
  const readingBranch = `
    <div class="cb-up-organigram-branch cb-up-organigram-branch--reading">
      ${accepted.reading ? renderReadingItemCard(accepted.reading, unit.id) : `
        <div class="cb-up-item-card cb-up-item-card--empty" data-reading-panel-action="open">
          <span class="cb-up-empty-title">Asignar o generar lectura base</span>
          <span class="cb-up-badge cb-up-badge--accent">+ Asignar</span>
        </div>
      `}
    </div>
  `;
  const projectActivityBranches = projectActivities.length ? `
    <div class="cb-up-organigram-branch cb-up-organigram-branch--project">
      ${projectActivities.map((activity) => renderActivityItemCard(activity, unit, projectMode, activities.indexOf(activity))).join("")}
    </div>
  ` : "";

  return `
    <article class="cb-up-unit-card${active ? " is-active" : ""}${isCollapsed ? " is-collapsed" : ""}" data-unit-id="${escapeHtml(unitId)}">
      <header class="cb-up-unit-header" data-unit-toggle="${escapeHtml(unitId)}" role="button" tabindex="0" aria-expanded="${isCollapsed ? "false" : "true"}">
        <div class="cb-up-unit-title-group">
          <h3 class="cb-up-unit-title">${escapeHtml(heading)}</h3>
        </div>
        <div class="cb-up-unit-controls">
          <button type="button" class="cb-icon-btn" data-unit-action="edit" title="Editar unidad" aria-label="Editar unidad"><i class="fas fa-pen"></i></button>
          <button type="button" class="cb-icon-btn cb-icon-btn--danger" data-unit-action="remove" title="Eliminar unidad" aria-label="Eliminar unidad"><i class="fas fa-trash"></i></button>
        </div>
      </header>

      <div class="cb-up-section-list"${isCollapsed ? " hidden" : ""}>
        <!-- El proyecto es una rama hermana de la lectura y ocupa el primer lugar. -->
        ${projectActivityBranches + readingBranch + (remainingActivities.length ? activitiesBranch : "")}

        <!-- 3. Recursos Didácticos (Acordeón con sangría jerárquica) -->
        <div class="cb-up-organigram-branch cb-up-organigram-branch--resources">
          <div class="cb-up-group-header" data-group-toggle="resources-${escapeHtml(unitId)}" role="button" tabindex="0" aria-expanded="${resourcesCollapsed ? "false" : "true"}">
            <div class="cb-up-group-header-left">
              <span class="cb-up-group-title">Recursos Didácticos</span>
              <span class="cb-up-group-count">${resources.length}</span>
            </div>
            <i class="fas fa-chevron-down cb-up-group-chevron" aria-hidden="true"></i>
          </div>
          <div class="cb-up-group-items" data-group-items="resources-${escapeHtml(unitId)}"${resourcesCollapsed ? ' hidden style="display:none;"' : ""}>
            ${resources.length ? (() => {
              const sorted = [...resources].sort((a, b) => {
                if (resources.every((item) => Number.isFinite(Number(item.order)))) return Number(a.order) - Number(b.order);
                const actA = findResourceActivity(a, unit);
                const actB = findResourceActivity(b, unit);
                const orderA = actA ? activities.indexOf(actA) : 999;
                const orderB = actB ? activities.indexOf(actB) : 999;
                if (orderA !== orderB) return orderA - orderB;
                return (a.order ?? 0) - (b.order ?? 0);
              });
              const groups = new Map();
              sorted.forEach((resource) => {
                const key = `${normalize(resource.subtopic)}|${getResourceBadgeMeta(resource).type}`;
                if (!groups.has(key)) groups.set(key, resource);
              });
              return [...groups.values()].map((resource, idx) => renderResourceItemCard(resource, unit, projectMode, idx)).join("");
            })() : `
              <div class="cb-resource-empty-state" role="status">
                <span class="cb-resource-empty-icon"><i class="fas fa-layer-group" aria-hidden="true"></i></span>
                <div><strong>Aún no hay recursos</strong><p>Las fichas, anexos y materiales de apoyo aparecerán aquí al generarlos.</p></div>
              </div>
            `}
          </div>
        </div>

        <!-- 4. Notas del Maestro (Acordeón con sangría jerárquica) -->
        <div class="cb-up-organigram-branch cb-up-organigram-branch--notes">
          <div class="cb-up-group-header" data-group-toggle="notes-${escapeHtml(unitId)}" role="button" tabindex="0" aria-expanded="${notesCollapsed ? "false" : "true"}">
            <div class="cb-up-group-header-left">
              <span class="cb-up-group-title">Notas del Maestro</span>
              <span class="cb-up-group-count">${totalNotesCount}</span>
            </div>
            <i class="fas fa-chevron-down cb-up-group-chevron" aria-hidden="true"></i>
          </div>
          <div class="cb-up-group-items" data-group-items="notes-${escapeHtml(unitId)}"${notesCollapsed ? ' hidden style="display:none;"' : ""}>
            ${renderTeacherNotesList(unit, activities, resources, projectMode)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderTeacherNotesList(unit = {}, activities = [], resources = [], projectMode = false) {
  const notesCards = [];

  // 1. Notas del maestro por cada subtema
  groupActivitiesForPanel(activities).forEach((activityGroup, idx) => {
    const activity = activityGroup[0];
    const subtopicTitle = getActivityToggleLabel(activity, projectMode, unit.meta?.category);
    const iconInfo = getActivityIconInfo(activity, projectMode, unit.meta?.category);
    const note = (activity.notes && activity.notes[0]) ||
      (unit.accepted?.teacherNotes || []).find((n) => n.activityId === activity.id || (n.subtopic && normalize(n.subtopic) === normalize(subtopicTitle)));

    notesCards.push(`
      <article class="cb-approved-card cb-approved-card--collapsible cb-teacher-notes-card cb-up-item-card" draggable="true" data-sortable-type="activity" data-sortable-id="${escapeHtml(activity.id || String(idx))}" data-sortable-ids="${escapeHtml(JSON.stringify(activityGroup.map((item) => item.id).filter(Boolean)))}" data-teacher-notes-card-id="${escapeHtml(note?.id || `subtopic-${activity.id || idx}`)}" data-activity-id="${escapeHtml(activity.id || String(idx))}" ${activity.mathGroup ? `data-math-group="${escapeHtml(activity.mathGroup)}"` : ""} data-unit-id="${escapeHtml(unit.id || "")}">
        <div class="cb-up-item-body">
          <div class="cb-up-item-header-row">
            <i class="${iconInfo.iconClass} cb-session-document-icon" style="color: ${iconInfo.color};" aria-hidden="true"></i>
            <p class="cb-up-item-title">NDM: ${escapeHtml(subtopicTitle)}</p>
          </div>
        </div>
      </article>
    `);
  });

  // 2. Fichas de trabajo agrupadas en UN SOLO subtema (con pestañas por página en el subpanel)
  const fichaResources = resources.filter((r) => getResourceBadgeMeta(r).type === "ficha");
  if (fichaResources.length > 0) {
    const primaryFicha = fichaResources[0];
    const cardTitle = fichaResources.length > 1
      ? "NDM: Fichas de trabajo"
      : `NDM: ${formatFichaDisplayTitle(primaryFicha, unit, 0)}`;

    notesCards.push(`
      <article class="cb-approved-card cb-approved-card--collapsible cb-teacher-notes-card cb-up-item-card cb-teacher-notes-card--ficha" draggable="true" data-sortable-type="resource" data-sortable-id="${escapeHtml(primaryFicha.id || "")}" data-teacher-notes-card-id="fichas-group" data-is-fichas-group="true" data-resource-id="${escapeHtml(primaryFicha.id || "")}" data-unit-id="${escapeHtml(unit.id || "")}">
        <div class="cb-up-item-body">
          <div class="cb-up-item-header-row">
            <i class="fas fa-pen-nib cb-session-document-icon" style="color: #2563eb;" aria-hidden="true"></i>
            <p class="cb-up-item-title">${escapeHtml(cardTitle)}</p>
          </div>
        </div>
      </article>
    `);
  }

  {
    const globalNotes = (unit.accepted?.teacherNotes || []).filter((note) => {
      const title = String(note.title || "").toLowerCase();
      if (title.includes("recortable") || title.includes("cutout")) return false;
      if (note.resourceId) {
        const res = (unit.accepted?.resources || []).find((r) => r.id === note.resourceId);
        if (res && getResourceBadgeMeta(res).type === "recortable") return false;
      }
      if (activities.some((activity) => normalize(activity.subtopic) === normalize(note.subtopic))) return false;
      return true;
    });
    if (globalNotes.length) {
      const uniqueSubtopics = new Set();
      notesCards.push(...globalNotes.filter((note) => {
        const key = normalize(note.subtopic || note.title || note.id);
        if (uniqueSubtopics.has(key)) return false;
        uniqueSubtopics.add(key);
        return true;
      }).map((note, idx) => {
        const correspondingActivity = (unit.accepted?.activities || []).find(a => a.id === note.activityId) || unit.accepted?.activities?.[idx];
        let cleanNoteTitle = "";
        if (correspondingActivity) {
          cleanNoteTitle = getActivityToggleLabel(correspondingActivity, projectMode, unit.meta?.category);
        } else {
          cleanNoteTitle = String(note.title || "")
            .replace(/^NDM:\s*/i, "")
            .replace(/^Nota(?:s)?\s+(?:del\s+maestro|para\s+el\s+docente):\s*/i, "")
            .replace(/^(?:Orientaciones\s+(?:metodol[oó]gicas|docentes|pedag[oó]gicas)|Notas\s+del\s+maestro)(?:\s+por\s+actividad)?\s*[:\-–—]?\s*/i, "")
            .replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "")
            .trim() || `Orientación ${idx + 1}`;
        }
        return `
        <article class="cb-approved-card cb-approved-card--collapsible cb-teacher-notes-card cb-up-item-card" draggable="true" data-sortable-type="teacher-note" data-sortable-id="${escapeHtml(note.id || String(idx))}" data-teacher-notes-card-id="${escapeHtml(note.id || String(idx))}" data-unit-id="${escapeHtml(unit.id || "")}">
          <div class="cb-up-item-body">
            <div class="cb-up-item-header-row">
              <i class="fas fa-chalkboard-user cb-session-document-icon" style="color: #0284c7;" aria-hidden="true"></i>
              <p class="cb-up-item-title">NDM: ${escapeHtml(cleanNoteTitle)}</p>
            </div>
          </div>
        </article>
      `;
      }));
    }
  }

  return notesCards.length ? notesCards.join("") : `<div class="cb-empty-hint">Sin notas del maestro configuradas aún.</div>`;
}

export function getActivityIconInfo(activity = {}, projectMode = false, unitCategory = "") {
  const rawSubtopic = String(activity.subtopic || "").toLowerCase();
  const rawCategory = String(activity.category || unitCategory || "").toLowerCase();
  const rawTitle = String(activity.title || "").toLowerCase();
  const rawSection = String(activity.section || "").toLowerCase();
  const combined = `${rawSubtopic} ${rawCategory} ${rawTitle} ${rawSection}`;

  // 1. Habilidades -> icono de cerebro morado
  if (combined.includes("habilidad") || combined.includes("cerebro") || combined.includes("neuro") || combined.includes("cognitiv")) {
    return { iconClass: "fas fa-brain", color: "#9333ea" };
  }

  // 2. Proyecto -> color morado
  if (projectMode || combined.includes("proyecto")) {
    return { iconClass: "fas fa-file-alt", color: "#9333ea" };
  }

  // Artes -> icono de paleta de colores
  if (combined.includes("artes") || combined.includes("arte") || combined.includes("pintur") || combined.includes("dibujo")) {
    return { iconClass: "fas fa-palette", color: "#f59e0b" };
  }

  // Ortografía -> icono de ortografía (spell-check)
  if (combined.includes("ortograf") || combined.includes("ortográf")) {
    return { iconClass: "fas fa-spell-check", color: "#0284c7" };
  }

  // Gramática -> icono de pluma / gramática
  if (combined.includes("gramatic") || combined.includes("gramátic")) {
    return { iconClass: "fas fa-pen-nib", color: "#2563eb" };
  }

  // Expresión escrita -> icono de edición/escritura
  if (combined.includes("expresion escrita") || combined.includes("expresión escrita") || combined.includes("redaccion") || combined.includes("escrita")) {
    return { iconClass: "fas fa-pen-to-square", color: "#0369a1" };
  }

  // Comprensión lectora -> icono de lector
  if (combined.includes("comprension") || combined.includes("comprensión") || combined.includes("lectora")) {
    return { iconClass: "fas fa-book-reader", color: "#0ea5e9" };
  }

  // Expresión oral -> icono de diálogo/micrófono
  if (combined.includes("expresion oral") || combined.includes("expresión oral") || combined.includes("oral")) {
    return { iconClass: "fas fa-comments", color: "#8b5cf6" };
  }

  // Dictado -> icono de lápiz/caligrafía
  if (combined.includes("dictado")) {
    return { iconClass: "fas fa-pen-fancy", color: "#0d9488" };
  }

  // 3. Matemáticas -> color rosa magenta
  if (combined.includes("matematic") || combined.includes("matemátic") || combined.includes("calcul") || combined.includes("numer") || combined.includes("pensamiento matem")) {
    return { iconClass: "fas fa-calculator", color: "#d946ef" };
  }

  // 4. Geografía -> color verde
  if (combined.includes("geograf") || combined.includes("geográf") || combined.includes("espacio") || combined.includes("localidad")) {
    return { iconClass: "fas fa-earth-americas", color: "#16a34a" };
  }

  // 5. Historia -> color verde
  if (combined.includes("histori") || combined.includes("tiempo") || combined.includes("pasado")) {
    return { iconClass: "fas fa-landmark", color: "#16a34a" };
  }

  // 6. Ciencias Naturales -> color verde
  if (combined.includes("natural") || combined.includes("medio") || combined.includes("biolog") || combined.includes("ciencias experimentales")) {
    return { iconClass: "fas fa-flask", color: "#16a34a" };
  }

  // Default Lenguaje / Comunicación
  return { iconClass: "fas fa-file-alt", color: "#0ea5e9" };
}

function renderReadingItemCard(reading = {}, unitId = "") {
  return `
    <div class="cb-up-item-card" draggable="true" data-sortable-type="reading" data-sortable-id="${escapeHtml(reading.id || unitId)}" data-reading-card-id="${escapeHtml(reading.id || unitId)}" data-unit-id="${escapeHtml(unitId)}">
      <div class="cb-up-item-body">
        <div class="cb-up-item-header-row">
          <i class="fas fa-book-open cb-session-document-icon" style="color: #0284c7;" aria-hidden="true"></i>
          <p class="cb-up-item-title">${escapeHtml(reading.title || "Lectura base")}</p>
        </div>
      </div>
      <div class="cb-up-item-actions">
        ${renderReadingActionMenu(unitId)}
      </div>
    </div>
  `;
}

function groupActivitiesForPanel(activities = []) {
  const groups = [];
  const bySubtopic = new Map();
  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    const key = normalize(activity.subtopic || activity.section || activity.id);
    if (!bySubtopic.has(key)) {
      const group = [];
      bySubtopic.set(key, group);
      groups.push(group);
    }
    bySubtopic.get(key).push(activity);
  });
  bySubtopic.forEach((group) => group.sort((a, b) => Number(a.pageOrder ?? a.mathIndex ?? 0) - Number(b.pageOrder ?? b.mathIndex ?? 0)));
  return groups;
}

function renderActivityItemCard(activity = {}, unit = {}, projectMode = false, index = 0, group = [activity]) {
  const subtopicTitle = getActivityToggleLabel(activity, projectMode, unit.meta?.category);
  const iconInfo = getActivityIconInfo(activity, projectMode, unit.meta?.category);

  const isEmpty = !activity.html;
  return `
    <div class="cb-up-item-card ${isEmpty ? 'cb-up-item-card--empty' : ''} ${activity.mathGroup ? 'cb-up-item-card--math-group' : ''}" draggable="true" data-sortable-type="activity" data-sortable-id="${escapeHtml(activity.id || String(index))}" data-sortable-ids="${escapeHtml(JSON.stringify(group.map((item) => item.id).filter(Boolean)))}" data-activity-card-id="${escapeHtml(activity.id || String(index))}" ${activity.mathGroup ? `data-math-group="${escapeHtml(activity.mathGroup)}" data-math-activity-count="${group.length}"` : ""} data-unit-id="${escapeHtml(unit.id || "")}">
      <div class="cb-up-item-body">
        <div class="cb-up-item-header-row">
          <i class="${iconInfo.iconClass} cb-session-document-icon" style="color: ${iconInfo.color};" aria-hidden="true"></i>
          <p class="cb-up-item-title">${escapeHtml(subtopicTitle)}${activity.mathGroup && group.length > 1 ? ` <span class="cb-up-item-count">${group.length} actividades</span>` : ""}</p>
        </div>
      </div>
      <div class="cb-up-item-actions">
        ${renderCardActionMenu("activity", projectMode, activity)}
      </div>
    </div>
  `;
}

export function formatResourceCode(resource = {}, unit = {}, index = 0) {
  const type = normalizeResourceType(resource);
  const unitNum = String(unit?.meta?.unit || "1").replace(/\D+/g, "") || "1";

  if (type === "video") {
    return "Guion de Video";
  }

  const label = type === "ficha" ? "Ficha"
    : type === "anexo" ? "Anexo"
    : type === "recortable" ? "Recortable"
    : "Recurso";

  // Identificar posición secuencial entre los recursos del mismo tipo en la unidad
  const sameTypeResources = (unit.accepted?.resources || []).filter(r => normalizeResourceType(r) === type);
  let typeIndex = resource.id ? sameTypeResources.findIndex(r => r.id === resource.id) : -1;
  if (typeIndex < 0) typeIndex = sameTypeResources.indexOf(resource);
  if (typeIndex < 0 && resource.code) typeIndex = sameTypeResources.findIndex(r => r.code === resource.code);
  if (typeIndex === -1) {
    typeIndex = index >= 0 ? index : 0;
  }
  const sequentialLetter = String.fromCharCode(97 + (typeIndex % 26));

  return `${label} ${unitNum}${sequentialLetter}`;
}

export function formatFichaDisplayTitle(resource = {}, unit = {}, index = 0) {
  const code = formatResourceCode(resource, unit, index);
  const rawTitle = resource.title || resource.subtopic || resource.context || "Trabajo autónomo";
  const cleanTitle = String(rawTitle)
    .replace(/^(?:Ficha(?:\s+de\s+(?:refuerzo|trabajo))?(?:\s+[0-9]+[a-z]?)?)\s*[:\-–—]\s*/i, "")
    .replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "")
    .trim();
  return cleanTitle ? `${code}: ${cleanTitle}` : code;
}

export function findResourceActivity(resource = {}, unit = {}) {
  const activities = unit.accepted?.activities || [];
  if (!activities.length) return null;

  if (resource.activityId) {
    const act = activities.find((a) => String(a.id) === String(resource.activityId) || String(a.sectionId) === String(resource.activityId));
    if (act) return act;
  }
  if (resource.targetActivityId) {
    const act = activities.find((a) => String(a.id) === String(resource.targetActivityId));
    if (act) return act;
  }
  if (resource.subtopic) {
    const norm = normalize(resource.subtopic);
    const act = activities.find((a) => a.subtopic && normalize(a.subtopic) === norm);
    if (act) return act;
  }
  const idxMatch = String(resource.id || resource.code || "").match(/(?:ficha|anexo|recortable|video|res)[-_](\d+)[-_](\d+)/i);
  if (idxMatch) {
    const actIdx = parseInt(idxMatch[2], 10) - 1;
    if (activities[actIdx]) return activities[actIdx];
  }
  return null;
}

function renderResourceItemCard(resource = {}, unit = {}, projectMode = false, index = 0) {
  const meta = getResourceBadgeMeta(resource);
  const code = formatResourceCode(resource, unit, index);
  let displayTitle = "";
  if (meta.type === "ficha") {
    displayTitle = formatFichaDisplayTitle(resource, unit, index);
  } else {
    const activity = findResourceActivity(resource, unit);
    const subtopicTitle = activity
      ? getActivityToggleLabel(activity, projectMode, unit.meta?.category)
      : (resource.subtopic || resource.context || "");
    const cleanTitle = cleanResourceSubtopicTitle(resource.title || "");
    const cleanSubtopic = cleanResourceSubtopicTitle(subtopicTitle || "");
    displayTitle = cleanSubtopic
      ? `${code}: ${cleanSubtopic}`
      : (cleanTitle ? `${code}: ${cleanTitle}` : code);
  }

  return `
    <div class="cb-up-item-card" draggable="true" data-sortable-type="resource" data-sortable-id="${escapeHtml(resource.id || "")}" data-resource-card-id="${escapeHtml(resource.id || "")}" data-unit-id="${escapeHtml(unit.id || "")}">
      <div class="cb-up-item-body">
        <div class="cb-up-item-header-row">
          <i class="fas ${meta.icon} cb-session-document-icon" style="color: ${meta.color};" aria-hidden="true"></i>
          <p class="cb-up-item-title">${escapeHtml(displayTitle)}</p>
        </div>
      </div>
      <div class="cb-up-item-actions">
        <button type="button" class="cb-card-delete-direct" data-resource-action="remove" title="Eliminar recurso" aria-label="Eliminar recurso" style="background:transparent; border:none; color:var(--cb-up-muted, #94a3b8); cursor:pointer; padding:4px 6px; font-size:12px; border-radius:4px; transition:color 0.15s, background 0.15s;">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
        ${renderCardActionMenu("resource", false, resource)}
      </div>
    </div>
  `;
}

function renderReadingActionMenu(unitId = "") {
  return `
    <details class="cb-card-menu">
      <summary class="cb-card-menu-toggle" aria-label="Opciones de lectura" title="Más opciones">
        <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
      </summary>
      <div class="cb-card-menu-panel">
        <button type="button" data-reading-panel-action="open"><i class="fas fa-book-open" aria-hidden="true"></i><span>Cambiar lectura</span></button>
        <button type="button" class="cb-card-menu-item--danger" data-reading-panel-action="remove"><i class="fas fa-trash" aria-hidden="true"></i><span>Eliminar</span></button>
      </div>
    </details>
  `;
}

function renderUnitHistory(session = {}) {
  const units = Array.isArray(session?.units) ? session.units.filter((unit) => hasApprovedUnitContent(unit)) : [];
  if (!units.length) return "";
  return `
    <section class="cb-unit-history">
      <p class="cb-panel-kicker">Unidades archivadas</p>
      <div class="cb-unit-history-list">
        ${units.slice().reverse().map((unit, index) => `
          <article class="cb-unit-history-item" data-unit-id="${escapeHtml(unit.id || "")}">
            <strong>${escapeHtml(unit.title || `Unidad ${index + 1}`)}</strong>
            <span>${escapeHtml([unit.meta?.grade, unit.meta?.category, unit.meta?.subtopic].filter(Boolean).join(" · "))}</span>
            <button type="button" data-unit-action="open">Abrir</button>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function hasApprovedUnitContent(unit = {}) {
  const approved = unit?.accepted || {};
  return Boolean(
    approved.reading ||
    (Array.isArray(approved.activities) && approved.activities.length) ||
    (Array.isArray(approved.resources) && approved.resources.length) ||
    (Array.isArray(approved.teacherNotes) && approved.teacherNotes.length)
  );
}

function buildUnitHeading(unit = {}) {
  const unitLabel = `Unidad ${unit?.meta?.unit || ""}`.trim();
  const title = String(unit?.title || "").trim();
  if (!title || /^(nueva unidad|nueva sesi[oó]n)$/i.test(title)) return unitLabel;
  if (normalize(title).startsWith(normalize(unitLabel))) return title;
  return `${unitLabel}. ${title}`;
}

function renderCollapsibleSection({ key = "", title = "", kicker = "", toggleLabel = "", body = "", actions = "", belowHeadActions = "", extraClass = "", openByDefault = false } = {}) {
  const collapsed = getCollapsedState(key, !openByDefault);
  const visibleTitle = String(toggleLabel || title || kicker || "Sección").trim();
  return `
    <section class="cb-collapsible ${extraClass}" data-collapse-shell="${escapeHtml(key)}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-collapsible-head">
        <button type="button" class="cb-collapsible-toggle" data-collapse-toggle="${escapeHtml(key)}" aria-expanded="${collapsed ? "false" : "true"}">
          <span>
            <strong>${escapeHtml(visibleTitle)}</strong>
          </span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${actions ? `<div class="cb-collapsible-actions">${actions}</div>` : ""}
      </div>
      ${belowHeadActions || ""}
      <div class="cb-collapsible-body">
        ${body}
      </div>
    </section>
  `;
}

function renderTeacherNotesBlock(notes = {}, index = 0) {
  const safeId = escapeHtml(notes.id || String(index));
  const collapseKey = `teacher-notes-${notes.id || index}`;
  const collapsed = getCollapsedState(`approved-card-${collapseKey}`, true);
  const notesHtml = formatTeacherNotesHtml(notes.html || "");
  return `
    <article class="cb-approved-card cb-approved-card--collapsible cb-teacher-notes-card" data-teacher-notes-id="${safeId}" data-approved-card-shell="${escapeHtml(collapseKey)}" data-card-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-teacher-notes-card-head">
        <button type="button" class="cb-approved-card-toggle" data-approved-card-toggle aria-expanded="${collapsed ? "false" : "true"}">
          <div class="cb-card-toggle-headline">
            <span class="cb-up-badge cb-up-badge--notes">Notas</span>
            <strong>Notas del maestro</strong>
          </div>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div>
          <button type="button" class="cb-icon-btn" data-teacher-notes-action="save" title="Guardar cambios" aria-label="Guardar cambios">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="cb-icon-btn cb-icon-btn--danger" data-teacher-notes-action="delete" title="Eliminar notas" aria-label="Eliminar notas">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="cb-approved-card-body">
        <div class="cb-teacher-notes-editable" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" aria-label="Texto de las notas del maestro">${notesHtml}</div>
      </div>
    </article>
  `;
}

function getActivityToggleLabel(activity = {}, projectMode = false, unitSection = "") {
  const candidates = [activity.subtopic, activity.section, activity.title];
  const subtopic = candidates.map(normalizeActivitySubtopicTitle).find(Boolean);
  const rawLabel = formatSyaKey(subtopic || activity.category || unitSection || (projectMode ? "Proyecto" : "Actividad"));
  return String(rawLabel || "")
    .replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "")
    .replace(/^(?:Orientaciones\s+(?:metodol[oó]gicas|docentes|pedag[oó]gicas)|Notas\s+del\s+maestro)(?:\s+por\s+actividad)?\s*[:\-–—]?\s*/i, "")
    .trim() || (projectMode ? "Proyecto" : "Actividad");
}

function formatTeacherNotesHtml(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let html = "";
  let listType = "";
  let listItems = [];
  const flushList = () => {
    if (!listItems.length) return;
    html += `<${listType}>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${listType}>`;
    listType = "";
    listItems = [];
  };

  lines.forEach((line) => {
    const heading = line.match(/^(?:#{1,6}\s*)?(?:\d+[.)]\s*)?(.{3,80}:)$/);
    const unordered = line.match(/^[-*•]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered?.[1] || ordered?.[1] || "").trim());
      return;
    }
    flushList();
    if (heading) {
      html += `<h4>${escapeHtml(heading[1].replace(/:$/, ""))}</h4>`;
      return;
    }
    html += `<p>${escapeHtml(line)}</p>`;
  });
  flushList();
  return html;
}

function getResourceBadgeMeta(resource = {}) {
  // Prefer the explicit resource label/code over a generic provider type.
  const raw = [resource.code, resource.title, resource.type, resource.context].filter(Boolean).join(" ").toLowerCase();
  if (raw.includes("ficha") || raw.includes("worksheet")) {
    return { type: "ficha", label: "Ficha", icon: "fa-pen-nib", color: "#2563eb", badgeClass: "cb-up-badge--worksheet" };
  }
  if (raw.includes("anexo") || raw.includes("annex")) {
    return { type: "anexo", label: "Anexo", icon: "fa-image", color: "#d97706", badgeClass: "cb-up-badge--annex" };
  }
  if (raw.includes("recortable") || raw.includes("cutout")) {
    return { type: "recortable", label: "Recortable", icon: "fa-scissors", color: "#9333ea", badgeClass: "cb-up-badge--cutout" };
  }
  if (raw.includes("video") || raw.includes("guion") || raw.includes("guión")) {
    return { type: "video", label: "Guión", icon: "fa-film", color: "#ef4444", badgeClass: "cb-up-badge--video" };
  }
  return { type: "recurso", label: "Recurso", icon: "fa-file-lines", color: "#0ea5e9", badgeClass: "cb-up-badge--resource" };
}

function renderResource(resource = {}) {
  const meta = getResourceBadgeMeta(resource);
  const cleanTitle = cleanResourceSubtopicTitle(resource.title || "");
  const resourceTitle = meta.type === "ficha"
    ? formatFichaDisplayTitle(resource, {}, 0)
    : (cleanTitle ? `${resource.code || "Recurso"}: ${cleanTitle}` : String(resource.title || resource.code || resource.context || resource.type || "Recurso").trim());
  const context = resource.context || resource.subtopic || "";
  const collapseKey = `resource-${resource.id || resource.code || resource.title || "item"}`;
  const collapsed = getCollapsedState(`approved-card-${collapseKey}`, true);
  return `
    <article class="cb-approved-card cb-approved-card--collapsible cb-resource-card" data-resource-id="${escapeHtml(resource.id)}" data-approved-card-shell="${escapeHtml(collapseKey)}" data-card-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-approved-card-head">
        <button type="button" class="cb-approved-card-toggle" data-approved-card-toggle aria-expanded="${collapsed ? "false" : "true"}">
          <div class="cb-card-toggle-headline">
            <span class="cb-badge ${meta.badgeClass}"><i class="fas ${meta.icon}" aria-hidden="true"></i> ${meta.label}</span>
            <strong>${escapeHtml(resourceTitle)}</strong>
          </div>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${renderCardActionMenu("resource", false, resource)}
      </div>
      <div class="cb-approved-card-body">
        ${context ? `<div class="cb-resource-context-tag"><i class="fas fa-link" aria-hidden="true"></i> <span>${escapeHtml(context)}</span></div>` : ""}
        <div class="cb-approved-html">${resource.html || ""}</div>
        ${renderSourceLinks(resource.citations)}
        ${(resource.notes || []).map((note) => `<div class="cb-note-inline"><strong>Notas del recurso</strong>${note.html || ""}</div>`).join("")}
      </div>
    </article>
  `;
}

function renderSourceLinks(citations = []) {
  const items = Array.isArray(citations) ? citations.filter((item) => item?.url) : [];
  if (!items.length) return "";
  return `<aside class="cb-citations"><strong>Fuentes verificadas</strong><ol>${items.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a></li>`).join("")}</ol></aside>`;
}

function renderSessionBibliography(session = {}) {
  const citations = collectSessionBibliography(session);
  if (!citations.length) return "";
  const units = new Map((session.units || []).map((unit) => [unit.id, buildUnitHeading(unit)]));
  const grouped = new Map();
  citations.forEach((citation) => {
    const linkedUnitIds = citation.links?.map((item) => item.unitId).filter(Boolean) || citation.unitIds || [];
    linkedUnitIds.forEach((unitId) => {
      if (!grouped.has(unitId)) grouped.set(unitId, []);
      grouped.get(unitId).push(citation);
    });
  });
  return renderCollapsibleSection({
    key: "session-bibliography",
    title: "Fuentes bibliográficas",
    openByDefault: false,
    extraClass: "cb-bibliography-section",
    body: `<div class="cb-bibliography-groups">${Array.from(grouped.entries()).map(([unitId, items]) => `
      <section class="cb-bibliography-group">
        <h3>${escapeHtml(units.get(unitId) || "Unidad")}</h3>
        <ol>${dedupeByApa(items).map((citation) => `<li>${citation.url ? `<a href="${escapeHtml(safeHttpUrl(citation.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.apa)}</a>` : escapeHtml(citation.apa)}</li>`).join("")}</ol>
      </section>
    `).join("")}</div>`
  });
}

function dedupeByApa(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.doi || item.url || item.apa || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeHttpUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function renderCardActionMenu(kind = "activity", projectMode = false, resource = null) {
  const dataAttribute = kind === "resource" ? "data-resource-action" : "data-activity-action";
  const subject = kind === "resource" ? "recurso" : projectMode ? "proyecto" : "actividad";
  const isCutout = kind === "resource" && resource && getResourceBadgeMeta(resource).type === "recortable";
  return `
    <details class="cb-card-menu">
      <summary class="cb-card-menu-toggle" aria-label="Opciones de ${subject}" title="Más opciones">
        <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
      </summary>
      <div class="cb-card-menu-panel">
        ${kind === "activity" ? '<button type="button" data-activity-action="sya"><i class="fas fa-list-check" aria-hidden="true"></i><span>SYA</span></button>' : ""}
        ${kind === "activity" ? '<button type="button" data-activity-action="add-resource"><i class="fas fa-paperclip" aria-hidden="true"></i><span>Añadir recurso</span></button>' : ""}
        ${kind === "activity" ? `<button type="button" data-activity-action="convert-styles"><i class="fas fa-swatchbook" aria-hidden="true"></i><span>${resource?.artifact?.exerciseStylePreviousHtml ? "Restaurar estilos anteriores" : "Unificar estilos"}</span></button>` : ""}
        <button type="button" ${dataAttribute}="edit"><i class="fas fa-pencil-alt" aria-hidden="true"></i><span>Editar</span></button>
        <button type="button" ${dataAttribute}="regenerate"><i class="fas fa-rotate-right" aria-hidden="true"></i><span>Regenerar</span></button>
        ${!isCutout ? `<button type="button" ${dataAttribute}="notes"><i class="fas fa-pen-nib" aria-hidden="true"></i><span>Generar notas</span></button>` : ""}
        <button type="button" class="cb-card-menu-item--danger" ${dataAttribute}="remove"><i class="fas fa-trash" aria-hidden="true"></i><span>Eliminar</span></button>
      </div>
    </details>
  `;
}

function positionCardMenu(menu) {
  const toggle = menu?.querySelector(".cb-card-menu-toggle");
  const menuPanel = menu?.querySelector(".cb-card-menu-panel");
  if (!toggle || !menuPanel) return;
  const toggleRect = toggle.getBoundingClientRect();
  const panelRect = menuPanel.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 5;
  const left = Math.max(
    viewportPadding,
    Math.min(window.innerWidth - panelRect.width - viewportPadding, toggleRect.right - panelRect.width)
  );
  const preferredTop = toggleRect.bottom + gap;
  const top = preferredTop + panelRect.height <= window.innerHeight - viewportPadding
    ? preferredTop
    : Math.max(viewportPadding, toggleRect.top - panelRect.height - gap);
  menuPanel.style.left = `${Math.round(left)}px`;
  menuPanel.style.top = `${Math.round(top)}px`;
}

export function normalizeResourceType(value = "") {
  if (typeof value === "object" && value !== null) {
    value = [value.code, value.title, value.context, value.type].filter(Boolean).join(" ");
  }
  const text = String(value || "").toLowerCase().trim();
  if (text.includes("ficha") || text.includes("worksheet")) return "ficha";
  if (text.includes("anexo") || text.includes("annex")) return "anexo";
  if (text.includes("recortable") || text.includes("cutout")) return "recortable";
  if (text.includes("video") || text.includes("guion") || text.includes("guión") || text.includes("video-script")) return "video";
  return "";
}



function renderSynonymsTable(rows = []) {
  return `
    <div class="cb-synonyms-table-wrap">
      <table class="cb-synonyms-table lectura-tabla-sinonimos">
        <thead>
          <tr>
            <th>Palabra</th>
            <th>Sinónimo simple</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${escapeHtml(item.palabra || "—")}</td>
              <td>${escapeHtml(item.sinonimos || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReadingQuestions(questions = []) {
  if (!Array.isArray(questions) || !questions.length) {
    return `<div class="cb-empty">Sin preguntas de comprensión guardadas.</div>`;
  }
  return `
    <div class="cb-reading-questions">
      <ol>
        ${questions.map((question) => `
          <li>
            <div class="cb-reading-question-text">${escapeHtml(question.texto || question.prompt || question.pregunta || "Pregunta")}</div>
            <div class="cb-reading-question-meta">
              ${(question.level || question.nivel) ? `<span>Nivel taxonómico: ${escapeHtml(question.level || question.nivel)}</span>` : ""}
              ${(question.criteria || question.criterio) ? `<span>Criterio: ${escapeHtml(question.criteria || question.criterio)}</span>` : ""}
            </div>
            ${(question.respuesta || question.answer) ? `<div class="cb-reading-answer">Respuesta esperada: ${escapeHtml(question.respuesta || question.answer)}</div>` : ""}
          </li>
        `).join("")}
      </ol>
    </div>
  `;
}

function formatSyaKey(key = "") {
  const value = String(key || "").trim();
  const labels = {
    Ortografía: "Convenciones lingüísticas: Ortografía",
    Ortografia: "Convenciones lingüísticas: Ortografía",
    Gramatica: "Convenciones lingüísticas: Gramática",
    Gramática: "Convenciones lingüísticas: Gramática",
    ExpresionEscrita: "Expresión escrita",
    TrazosDeLetras: "Trazos de letras",
    ComprensionLectora: "Comprensión lectora",
    ExpresionOral: "Expresión oral",
    ConocimientoDelMedio: "Conocimiento del medio",
    MiLocalidad: "Mi localidad",
    Geografia: "Geografía",
    CivicaEtica: "Formación cívica y ética",
    Matematicas: "Matemáticas"
  };
  return labels[value] || value
    .replace(/_/g, " ")
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/\bAE\b/g, "Aprendizaje esperado");
}

function formatSyaFieldLabel(label = "") {
  if (label === "T") return "Tema";
  if (label === "AE") return "Aprendizaje esperado";
  if (label === "C") return "Contenido";
  if (label === "P") return "Proceso o práctica";
  return label;
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCollapsedState(key = "", fallback = false) {
  try {
    return localStorage.getItem(`${COLLAPSE_PREFIX}${key}`) === "1" ? true : fallback;
  } catch (_) {
    return fallback;
  }
}

function setCollapsedState(key = "", collapsed = false) {
  try {
    localStorage.setItem(`${COLLAPSE_PREFIX}${key}`, collapsed ? "1" : "0");
  } catch (_) {}
}

function hasEditedSyaVersion(session = {}) {
  const active = session?.accepted?.sya || session?.sya || null;
  const original = session?.accepted?.syaOriginal || session?.syaOriginal || null;
  if (!active || !original) return false;
  try {
    return JSON.stringify(active) !== JSON.stringify(original);
  } catch (_) {
    return false;
  }
}

export function renderAutomationSpinner(panel, progressInfo = null) {
  const label = progressInfo?.label || "Orquestando agentes MCP, actividades y recursos pedagógicos...";
  let container = panel.querySelector("#cbAutomationSpinnerPanel");
  if (!container) {
    panel.innerHTML = `
      <div class="cb-automation-spinner-panel cb-compact-automation-card" id="cbAutomationSpinnerPanel">
        <div class="cb-compact-card-header">
          <div class="cb-compact-badge">
            <span class="cb-compact-beacon"></span>
            <span class="cb-compact-badge-text">Generando unidad</span>
          </div>
          <span class="cb-compact-percentage" id="cbAutomationPercentage">0%</span>
        </div>
        <div class="cb-compact-agent-row">
          <span class="cb-compact-agent-indicator" id="cbCompactAgentName">
            <i class="fas fa-microchip" aria-hidden="true"></i>
            <span>Orquestador MCP</span>
          </span>
          <span class="cb-compact-task-count" id="cbCompactTaskCount">Iniciando...</span>
        </div>
        <div class="cb-compact-track">
          <div class="cb-compact-bar" id="cbAutomationProgressBar" style="width: 0%"></div>
        </div>
        <p class="cb-compact-status-text" id="cbAutomationStatusText">${escapeHtml(label)}</p>
        <button type="button" class="cb-compact-open-modal-btn" id="cbOpenProductionModalBtn">
          <i class="fas fa-expand-alt" aria-hidden="true"></i>
          <span>Ver progreso en vivo</span>
        </button>
      </div>
    `;
    const openBtn = panel.querySelector("#cbOpenProductionModalBtn");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("cb:open-production-modal"));
      });
    }
  } else {
    const statusText = container.querySelector("#cbAutomationStatusText");
    if (statusText && label) statusText.textContent = label;
  }
}

export async function startAnimeSpinner(container) {
  if (!container) return;
  const ringMain = container.querySelector(".cb-orbital-ring--main");
  const ringDashed = container.querySelector(".cb-orbital-ring--dashed");
  const satellites = container.querySelector(".cb-orbital-satellites");
  const core = container.querySelector(".cb-orbital-core");
  const glow = container.querySelector(".cb-orbital-glow");
  const beacon = container.querySelector(".cb-orbital-beacon");

  let anime = window.anime;
  if (!anime) {
    try {
      const mod = await import("../vendor/animejs/anime.esm.min.js");
      anime = mod.default || mod;
    } catch (_) {}
  }
  if (!anime) return;

  try {
    if (ringMain) {
      anime({
        targets: ringMain,
        rotate: "1turn",
        duration: 3200,
        loop: true,
        easing: "linear"
      });
    }
    if (ringDashed) {
      anime({
        targets: ringDashed,
        rotate: "-1turn",
        duration: 4400,
        loop: true,
        easing: "linear"
      });
    }
    if (satellites) {
      anime({
        targets: satellites,
        rotate: "1turn",
        duration: 6000,
        loop: true,
        easing: "linear"
      });
    }
    if (core) {
      anime({
        targets: core,
        scale: [0.93, 1.07],
        direction: "alternate",
        loop: true,
        duration: 1600,
        easing: "easeInOutSine"
      });
    }
    if (glow) {
      anime({
        targets: glow,
        opacity: [0.2, 0.8],
        scale: [0.85, 1.25],
        direction: "alternate",
        loop: true,
        duration: 2000,
        easing: "easeInOutQuad"
      });
    }
    if (beacon) {
      anime({
        targets: beacon,
        scale: [0.8, 1.4],
        opacity: [0.5, 1],
        direction: "alternate",
        loop: true,
        duration: 750,
        easing: "easeInOutQuad"
      });
    }
  } catch (_) {}
}

export function renderReadingContentTitle(title = "", readingHtml = "") {
  let safeTitle = String(title || "").replace(/\s+/g, " ").trim();
  if (!safeTitle || /^lectura sin t[ií]tulo$/i.test(safeTitle)) safeTitle = inferReadingContentTitle(readingHtml);
  if (!safeTitle) return "";
  const source = String(readingHtml || "");
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    const headings = Array.from(doc.querySelectorAll("h1, h2, h3, [data-reading-title]"));
    if (headings.some((heading) => normalize(heading.textContent) === normalize(safeTitle))) return "";
  } else if (normalize(source.replace(/<[^>]+>/g, " ")).includes(normalize(safeTitle))) {
    return "";
  }
  return `<h2 class="cb-reading-content-title">${escapeHtml(safeTitle)}</h2>`;
}

export function inferReadingContentTitle(readingHtml = "") {
  const source = String(readingHtml || "");
  let text = source.replace(/<[^>]+>/g, " ");
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    text = doc.body.textContent || "";
  }
  text = text.replace(/\s+/g, " ").trim();
  const sentence = String(text.match(/^.{8,90}?[.!?](?:\s|$)/)?.[0] || "").replace(/[.!?]+$/, "").trim();
  return sentence || text.split(" ").filter(Boolean).slice(0, 8).join(" ");
}

export function renderReadingBodyWithInferredTitle(reading = {}) {
  const readingHtml = String(reading.html || reading.text || "").trim();
  return `${renderReadingContentTitle(reading.title, readingHtml)}<div class="cb-approved-html">${readingHtml}</div>`;
}
