export const SAVINGS_LEVEL_LABELS = Object.freeze({
  off: "Sin ahorro",
  medium: "Ahorro medio",
  high: "Ahorro alto",
  ultra: "Ahorro ultra",
  auto: "Automático"
});

const LEVEL_DESCRIPTIONS = Object.freeze({
  off: "Generación sin las restricciones del modo ahorro.",
  medium: "Reduce el ritmo de generación y limita algunos recursos diarios.",
  high: "Limita más sesiones y prioriza las imágenes de referencia.",
  ultra: "Aplica la restricción máxima a las generaciones nuevas.",
  auto: "Ajusta el nivel según la facturación mensual de Cloud Billing."
});

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function billingText(policy) {
  const billing = policy.billing;
  if (billing?.amount == null || billing.month !== String(policy.day || "").slice(0, 7)) return null;
  const amount = new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0
  }).format(billing.amount);
  return `${amount} MXN estimados`;
}

export function openSavingsDialog({ policy, onSave, errorMessage, returnFocus }) {
  document.getElementById("cbSavingsDialog")?.remove();
  const currentSelection = policy.mode === "auto" ? "auto" : policy.level;
  const dialog = element("dialog", "cb-savings-dialog");
  dialog.id = "cbSavingsDialog";
  dialog.setAttribute("aria-labelledby", "cbSavingsDialogTitle");

  const panel = element("div", "cb-savings-panel");
  const header = element("header", "cb-savings-dialog-header");
  const heading = element("div", "cb-savings-heading");
  heading.append(
    element("span", "cb-savings-eyebrow", "CONTROL GLOBAL DE IA"),
    element("h2", "", "Modo de ahorro")
  );
  heading.querySelector("h2").id = "cbSavingsDialogTitle";
  const close = element("button", "cb-savings-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar configuración de ahorro");
  close.addEventListener("click", () => dialog.close());
  header.append(heading, close);

  const intro = element("p", "cb-savings-intro", "El nivel seleccionado se aplica a todos los usuarios.");
  const summary = element("div", "cb-savings-summary");
  const active = element("div", "cb-savings-summary-item");
  active.append(
    element("span", "cb-savings-summary-label", "Nivel actual"),
    element("strong", "", policy.mode === "auto"
      ? `Automático · ${SAVINGS_LEVEL_LABELS[policy.level] || SAVINGS_LEVEL_LABELS.medium}`
      : (SAVINGS_LEVEL_LABELS[policy.level] || SAVINGS_LEVEL_LABELS.off))
  );
  summary.appendChild(active);
  // PigPen's text rides the free tier in every level, off included, so the panel states it
  // beside the billing figure instead of leaving it implied by the level name.
  const freeTier = policy.freeTier;
  if (freeTier) {
    const textItem = element("div", "cb-savings-summary-item");
    textItem.append(
      element("span", "cb-savings-summary-label", "Texto de Pigpen"),
      element("strong", "", freeTier.enabled && freeTier.keyConfigured
        ? `${freeTier.model} del plan gratuito (${freeTier.usedToday}/${freeTier.dailyCallCap} llamadas hoy)`
        : "Plan gratuito aun no activado")
    );
    summary.appendChild(textItem);
  }
  const billedAmount = billingText(policy);
  if (billedAmount) {
    const billing = element("div", "cb-savings-summary-item");
    billing.append(
      element("span", "cb-savings-summary-label", "Facturación del mes"),
      element("strong", "", billedAmount)
    );
    summary.appendChild(billing);
  }

  const choices = element("fieldset", "cb-savings-choices");
  choices.appendChild(element("legend", "", "Selecciona un modo"));
  const grid = element("div", "cb-savings-option-grid");
  for (const [value, label] of Object.entries(SAVINGS_LEVEL_LABELS)) {
    const option = element("label", "cb-savings-option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "cbSavingsLevel";
    input.value = value;
    input.checked = value === currentSelection;
    const content = element("span", "cb-savings-option-content");
    content.append(
      element("span", "cb-savings-option-title", label),
      element("span", "cb-savings-option-description", LEVEL_DESCRIPTIONS[value])
    );
    option.append(input, content);
    grid.appendChild(option);
  }
  choices.appendChild(grid);

  const automatic = element("div", "cb-savings-thresholds");
  automatic.appendChild(element("strong", "", "Escala automática"));
  automatic.appendChild(element("p", "", "$2,000 → Medio   ·   $3,500 → Alto   ·   $5,000 → Ultra"));
  if (!billedAmount) {
    automatic.appendChild(element("small", "", "Sin lectura de facturación de este mes. Automático aplicará Ahorro ultra hasta recibirla."));
  }

  const error = element("p", "cb-savings-error");
  error.setAttribute("role", "alert");
  const footer = element("footer", "cb-savings-dialog-footer");
  const cancel = element("button", "cb-savings-cancel", "Cancelar");
  cancel.type = "button";
  cancel.addEventListener("click", () => dialog.close());
  const save = element("button", "cb-savings-save", "Guardar modo");
  save.type = "button";
  save.disabled = true;
  choices.addEventListener("change", () => {
    error.textContent = "";
    save.disabled = choices.querySelector("input:checked")?.value === currentSelection;
  });
  save.addEventListener("click", async () => {
    const selection = choices.querySelector("input:checked")?.value;
    if (!selection || selection === currentSelection) return;
    save.disabled = true;
    save.textContent = "Guardando…";
    error.textContent = "";
    try {
      await onSave(selection);
      dialog.close();
    } catch (cause) {
      error.textContent = errorMessage(cause);
      save.disabled = false;
      save.textContent = "Guardar modo";
    }
  });
  footer.append(cancel, save);
  panel.append(header, intro, summary, choices, automatic, error, footer);
  dialog.appendChild(panel);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
  close.focus();
}
