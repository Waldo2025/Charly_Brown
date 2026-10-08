export async function withMarcieAutomationLock(sessionId, action) {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request || !sessionId) return action();
  return locks.request(`marcie-automation-${sessionId}`, { ifAvailable: true }, (lock) => {
    if (lock) return action();
    const error = new Error("Esta sesión ya se está generando en otra pestaña. Espera a que termine allí para evitar conflictos al guardar.");
    error.code = "marcie_automation_in_other_tab";
    error.userMessage = error.message;
    throw error;
  });
}
