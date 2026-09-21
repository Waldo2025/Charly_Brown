import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { buildGeminiApiUrl } from "../js/api-client.js";

export async function downloadApprovedContent({ sessionId = "", format = "docx", documentKind = "student" } = {}) {
  const url = buildGeminiApiUrl("/api/charly-brown/export");
  if (!url) throw new Error("Backend de exportación no configurado.");
  const user = getAuth().currentUser;
  if (!user?.getIdToken) throw new Error("Inicia sesión para descargar el contenido.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify({ sessionId, format, documentKind })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(String(data?.message || data?.error || `Exportación HTTP ${response.status}`));
    error.status = response.status;
    error.code = String(data?.error || "CHARLY_EXPORT_FAILED");
    throw error;
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `charly-brown-${documentKind === "teacher-notes" ? "notas-del-maestro" : "contenido"}.${format}`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return filename;
}

export async function downloadApprovedFiles({ sessionId = "", format = "docx" } = {}) {
  const contentFilename = await downloadApprovedContent({ sessionId, format, documentKind: "student" });
  let notesFilename = "";
  try {
    notesFilename = await downloadApprovedContent({ sessionId, format, documentKind: "teacher-notes" });
  } catch (error) {
    if (error?.code !== "NO_TEACHER_NOTES" && error?.status !== 409) throw error;
  }
  return { contentFilename, notesFilename };
}
