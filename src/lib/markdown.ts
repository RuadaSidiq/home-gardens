/** Minimal, safe Markdown subset for CMS pages: ## headings, paragraphs, *em*, **strong**, - lists. Output is escaped first. */
function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function inline(s: string) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}
export function renderMarkdown(md: string) {
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const b = block.trim();
      if (b.startsWith("## ")) return `<h2>${inline(b.slice(3))}</h2>`;
      if (b.split("\n").every((l) => l.trim().startsWith("- "))) return `<ul>${b.split("\n").map((l) => `<li>${inline(l.trim().slice(2))}</li>`).join("")}</ul>`;
      return `<p>${inline(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}
