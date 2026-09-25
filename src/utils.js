export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export const DESCONTOS = [25, 35, 42, 50];

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseMoney(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function todayParts() {
  const d = new Date();
  return { ano: d.getFullYear(), mes: d.getMonth(), dia: d.getDate() };
}

export function daysInMonth(ano, mesIndex) {
  return new Date(ano, mesIndex + 1, 0).getDate();
}

export function projectMonth(current, ano, mesIndex) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const totalDias = daysInMonth(ano, mesIndex);
  if (!current) return null;
  if (ano > anoAtual || (ano === anoAtual && mesIndex > mesAtual)) return null;
  if (ano < anoAtual || (ano === anoAtual && mesIndex < mesAtual)) return current;
  const dia = hoje.getDate();
  if (!dia) return current;
  return (current / dia) * totalDias;
}

export function projectionLabel(current, ano, mesIndex) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  if (!current) return "Projecao: —";
  if (ano > anoAtual || (ano === anoAtual && mesIndex > mesAtual)) return "Projecao: —";
  if (ano < anoAtual || (ano === anoAtual && mesIndex < mesAtual)) return `Resultado Final: ${formatMoney(current)}`;
  const projected = (current / hoje.getDate()) * daysInMonth(ano, mesIndex);
  return `Projecao: ${formatMoney(projected)}`;
}

export function averageDaily(total, ano, mesIndex) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const totalDias = daysInMonth(ano, mesIndex);
  if (ano > anoAtual || (ano === anoAtual && mesIndex > mesAtual)) return 0;
  if (ano < anoAtual || (ano === anoAtual && mesIndex < mesAtual)) {
    return total / totalDias;
  }
  return total / hoje.getDate();
}

export function hashPassword(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function toast(message, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2200);
}

export function confirmModal(message) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal show";
    wrap.innerHTML = `
      <div class="modal-content" style="max-width:340px;text-align:center">
        <p style="margin:8px 0 18px;font-size:15px">${escapeHtml(message)}</p>
        <div style="display:flex;gap:8px">
          <button class="btn-ghost" data-no>Cancelar</button>
          <button data-yes>Confirmar</button>
        </div>
      </div>`;
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.dataset.no !== undefined) {
        wrap.remove();
        resolve(false);
      }
      if (e.target.dataset.yes !== undefined) {
        wrap.remove();
        resolve(true);
      }
    });
    document.body.appendChild(wrap);
  });
}

export async function getDolar() {
  const cached = JSON.parse(localStorage.getItem("mc_dolar") || "null");
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) return cached.valor;
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
    const d = await r.json();
    const valor = Number(d?.USDBRL?.bid) || 5;
    localStorage.setItem("mc_dolar", JSON.stringify({ valor, ts: Date.now() }));
    return valor;
  } catch {
    return cached?.valor || 5;
  }
}
