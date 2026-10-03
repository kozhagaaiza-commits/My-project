import { escapeHtml } from "@/lib/telegram";

// Вёрстка писем (Чертёж 5.9.3): таблицы, фон #0A0A0B, текст #F2F2F3, кнопка #E6FF00 с тёмным текстом.
// Все подставляемые значения передаются СЫРЫМИ и экранируются здесь (escapeHtml) — вызывающий код ничего не экранирует сам.
// Версия text/plain строится из той же структуры (без HTML).

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailDoc {
  heading: string;
  paragraphs?: string[];
  /** Таблица «название — значение» (состав заказа и т.п.). */
  rows?: Array<{ left: string; right: string }>;
  /** Итоговая строка таблицы (выделяется). */
  total?: { left: string; right: string };
  button?: { label: string; url: string };
  footnote?: string;
}

const BG = "#0A0A0B";
const FG = "#F2F2F3";
const MUTED = "#A1A1AA";
const LINE = "#2A2A2E";
const ACCENT = "#E6FF00";
const ACCENT_TEXT = "#0A0A0B";
const FONT = "Arial, Helvetica, sans-serif";

/** Тема письма — одна строка (нет переводов строк: защита от инъекции заголовков). */
export const oneLine = (value: string): string => value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();

function rowHtml(left: string, right: string, bold: boolean): string {
  const weight = bold ? "font-weight:bold;" : "";
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:22px;color:${FG};${weight}">${escapeHtml(left)}</td>`
    + `<td align="right" style="padding:10px 0 10px 16px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:22px;color:${FG};white-space:nowrap;${weight}">${escapeHtml(right)}</td></tr>`;
}

export function buildEmail(subject: string, doc: EmailDoc): EmailContent {
  const parts: string[] = [];
  parts.push(`<tr><td style="padding:0 0 20px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:bold;color:${FG};">${escapeHtml(doc.heading)}</td></tr>`);
  for (const p of doc.paragraphs ?? []) {
    parts.push(`<tr><td style="padding:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${FG};">${escapeHtml(p)}</td></tr>`);
  }
  if (doc.rows?.length || doc.total) {
    const rows = (doc.rows ?? []).map((r) => rowHtml(r.left, r.right, false));
    if (doc.total) rows.push(rowHtml(doc.total.left, doc.total.right, true));
    parts.push(`<tr><td style="padding:0 0 20px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table></td></tr>`);
  }
  if (doc.button) {
    parts.push(
      `<tr><td style="padding:4px 0 24px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:6px;">`
      + `<a href="${escapeHtml(doc.button.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:${ACCENT_TEXT};text-decoration:none;">${escapeHtml(doc.button.label)}</a>`
      + `</td></tr></table></td></tr>`,
    );
  }
  if (doc.footnote) {
    parts.push(`<tr><td style="padding:0;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(doc.footnote)}</td></tr>`);
  }

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
${parts.join("\n")}
</table>
</td></tr></table>
</body></html>`;

  const lines: string[] = [doc.heading, ""];
  for (const p of doc.paragraphs ?? []) lines.push(p, "");
  if (doc.rows?.length || doc.total) {
    for (const r of doc.rows ?? []) lines.push(`${r.left} — ${r.right}`);
    if (doc.total) lines.push(`${doc.total.left}: ${doc.total.right}`);
    lines.push("");
  }
  if (doc.button) lines.push(`${doc.button.label}: ${doc.button.url}`, "");
  if (doc.footnote) lines.push(doc.footnote);
  return { subject: oneLine(subject), html, text: `${lines.join("\n").trim()}\n` };
}
