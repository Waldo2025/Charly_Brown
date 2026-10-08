// Keep generated answers identifiable in both proposal previews and approved content.
export function normalizeProposalAnswers(html = "") {
  const source = String(html || "");
  if (!source.includes("cb-synoptic-node") && !source.includes("cb-teacher-resp")) return source;

  const template = document.createElement("template");
  template.innerHTML = source;

  template.content.querySelectorAll(".cb-synoptic-node .cb-write-line").forEach((line) => {
    if (!line.textContent.trim() || line.querySelector(".answer")) return;
    const answer = document.createElement("span");
    answer.className = "answer";
    const value = document.createElement("span");
    value.className = "cb-teacher-resp";
    while (line.firstChild) value.appendChild(line.firstChild);
    answer.appendChild(value);
    line.appendChild(answer);
  });

  template.content.querySelectorAll(".cb-teacher-resp").forEach((value) => {
    if (value.closest(".answer")) return;
    const answer = document.createElement("span");
    answer.className = "answer";
    value.replaceWith(answer);
    answer.appendChild(value);
  });

  return template.innerHTML;
}
