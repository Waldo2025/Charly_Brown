function normalizeAccessToken(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

export function canonicalUserRole(value = "") {
  const token = normalizeAccessToken(value);
  if (!token) return "";
  if (["pending", "pendiente"].includes(token)) return "pending";
  return token;
}

export function canonicalApprovalStatus(value = "") {
  const token = normalizeAccessToken(value);
  if (!token) return "";
  if (["approved", "aprobado", "active", "activo"].includes(token)) return "approved";
  if (["rejected", "rechazado", "denied", "denegado", "blocked", "bloqueado"].includes(token)) return "rejected";
  if (["pending", "pendiente", "review", "revision"].includes(token)) return "pending";
  return token;
}

export function resolveApprovedUserProfile(data = {}) {
  const profile = data && typeof data === "object" ? data : {};
  const role = canonicalUserRole(
    profile.role || profile.rol || profile.userRole || profile.requestedRole
  );
  const status = canonicalApprovalStatus(
    profile.approvalStatus ||
    profile.status ||
    profile.estado ||
    profile.estadoAprobacion ||
    profile.aprobado
  );

  if (status === "approved") return { approved: true, role, status };
  if (status === "pending" || status === "rejected") return { approved: false, role, status };

  const approvedByFlag = profile.approved === true ||
    profile.isApproved === true ||
    profile.aprobado === true;
  if (approvedByFlag) return { approved: true, role, status: "approved" };

  const approvedByRole = Boolean(role && role !== "pending");
  return {
    approved: approvedByRole,
    role,
    status: approvedByRole ? "approved" : (status || "pending")
  };
}
