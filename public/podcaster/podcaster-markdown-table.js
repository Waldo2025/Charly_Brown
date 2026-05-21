export function toMarkdownTableCell(value = "") {
  return String(value || "")
    .replace(/\r\n?/g, " ")
    .replace(/\n/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}
