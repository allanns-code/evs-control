import { uid } from "./utils.js";
import { api, setToken, getToken, getAdminToken, setAdminToken } from "./api.js";
import { resolvePermissions, can as canPerm } from "../shared/permissions.js";

/* Estrutura mantida compativel com as telas existentes.
   Persistencia agora e online (Express + SQLite). */

const state = {
  session: null,
  data: null,
  planos: [],
  adminClients: [],
  adminStats: null,
  adminLicenses: [],
  actor: null,
};

let syncTimer = null;

function normalizeUserData(d) {
  if (!d) return d;
  d.cartelaMovs = d.cartelaMovs || [];
  d.fechamentoFlags = d.fechamentoFlags || {};
  const c = d.contas || [];
  if (
    c.length === 6 &&
    Number(c[0]?.pct) === 20 &&
    Number(c[4]?.pct) === 5 &&
    Number(c[5]?.pct) === 5
  ) {
    d.contas = [
      { id: "clf", sigla: "CLF", nome: "Liberdade Financeira", pct: 10 },
      { id: "aqb", sigla: "AQB", nome: "Aquisicao de bens", pct: 10 },
      { id: "sis", sigla: "SIS", nome: "Sistema", pct: 10 },
      { id: "nec", sigla: "NEC", nome: "Necessidades Basicas", pct: 50 },
      { id: "play", sigla: "PLAY", nome: "Diversao", pct: 10 },
      { id: "doa", sigla: "DOA", nome: "Doacao", pct: 10 },
    ];
  }
  return d;
}

async function loadUserData() {
  const r = await api.get("/data");
  state.data = normalizeUserData(r.data);
  return state.data;
}

async function loadPlanos() {
  const r = await api.get("/plans");
  state.planos = r.planos || [];
  return state.planos;
}

function scheduleSync() {
  if (!state.session || !state.data) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const payload = { ...state.data };
      await api.put("/data", { data: payload });
    } catch (err) {
      console.error("Falha ao sincronizar dados:", err.message);
    }
  }, 500);
}

function assertCan(key) {
  if (store.isOwner()) return;
  if (!canPerm(state.actor?.permissions, key)) {
    throw new Error("Operacao nao autorizada.");
  }
}

function mutate(fn) {
  if (!state.data) return;
  fn(state.data);
  scheduleSync();
}

function actorStamp() {
  const a = state.actor;
  if (!a) return {};
  return { createdBy: a.id, createdByName: a.nome, createdAt: Date.now(), status: "ativo" };
}

function applyActor(payload) {
  if (payload?.actor) {
    state.actor = payload.actor;
    return;
  }
  if (state.session) {
    state.actor = {
      id: state.session.id,
      nome: state.session.nome,
      email: state.session.email,
      type: state.session.role === "admin" ? "admin" : "owner",
      perfil: "proprietario",
      permissions: resolvePermissions("proprietario"),
    };
  }
}

export const store = {
  async bootstrap() {
    if (!getToken()) return false;
    try {
      const [me, planos] = await Promise.all([api.get("/me"), api.get("/plans")]);
      state.session = me.user;
      applyActor(me);
      state.planos = planos.planos || [];
      await loadUserData();
      return true;
    } catch {
      setToken(null);
      setAdminToken(null);
      state.session = null;
      state.data = null;
      state.actor = null;
      return false;
    }
  },

  currentUser() {
    return state.session;
  },
  data() {
    return state.data;
  },
  planos() {
    return state.planos;
  },
  actor() {
    return state.actor;
  },
  isAdmin() {
    return state.session?.role === "admin" && state.actor?.type !== "colaborador";
  },
  isOwner() {
    return state.actor?.type === "owner" || state.actor?.type === "admin";
  },
  isColaborador() {
    return state.actor?.type === "colaborador";
  },
  can(key) {
    if (!key) return true;
    if (store.isOwner()) return true;
    return canPerm(state.actor?.permissions, key);
  },
  isImpersonating() {
    return !!getAdminToken();
  },

  async register({ nome, email, senha, indicadoPor, licenca }) {
    const r = await api.post("/auth/register", { nome, email, senha, indicadoPor, licenca });
    setToken(r.token);
    setAdminToken(null);
    state.session = r.user;
    applyActor(r);
    await Promise.all([loadPlanos(), loadUserData()]);
    return r.user;
  },

  async login(email, senha) {
    const r = await api.post("/auth/login", { email, senha });
    setToken(r.token);
    setAdminToken(null);
    state.session = r.user;
    applyActor(r);
    await Promise.all([loadPlanos(), loadUserData()]);
    if (!state.session.role || state.session.role !== "admin") {
      const d = state.data;
      if (d?.perfil?.status === "suspenso") {
        setToken(null);
        state.session = null;
        throw new Error("Conta suspensa. Fale com o administrador.");
      }
    }
    return r.user;
  },

  async loginColaborador(email, senha) {
    const r = await api.post("/auth/login-colaborador", { email, senha });
    setToken(r.token);
    setAdminToken(null);
    state.session = r.user;
    state.colabSession = r.colaborador;
    applyActor(r);
    await Promise.all([loadPlanos(), loadUserData()]);
    return r;
  },

  async recover(email) {
    const r = await api.post("/auth/recover", { email });
    return r.nome;
  },

  logout() {
    try { api.post("/auth/logout", {}); } catch { /* ignore */ }
    setToken(null);
    setAdminToken(null);
    state.session = null;
    state.data = null;
    state.colabSession = null;
    state.actor = null;
  },

  async changePassword(senhaAtual, senhaNova) {
    await api.post("/me/password", { senhaAtual, senhaNova });
  },

  /* ===================== ADMIN ===================== */

  async adminLoad() {
    const [clients, stats, licenses, planos] = await Promise.all([
      api.get("/admin/clients", { useAdmin: true }),
      api.get("/admin/stats", { useAdmin: true }),
      api.get("/admin/licenses", { useAdmin: true }),
      api.get("/plans"),
    ]);
    state.adminClients = clients.clients || [];
    state.adminStats = stats.stats;
    state.adminLicenses = (licenses.licenses || []).map((l) => ({
      ...l,
      planoNome: l.planoNome || l.plano_nome,
      planoKey: l.planoKey || l.plano_key,
    }));
    state.planos = planos.planos || [];
    return state.adminStats;
  },
  adminListClients() {
    return state.adminClients;
  },
  adminStatsData() {
    return state.adminStats;
  },
  listLicenses() {
    return state.adminLicenses;
  },

  async impersonate(id) {
    const current = getToken();
    if (current) setAdminToken(current);
    const r = await api.post(`/admin/impersonate/${id}`, {}, { useAdmin: true });
    setToken(r.token);
    state.session = r.user;
    applyActor(r);
    await Promise.all([loadPlanos(), loadUserData()]);
    return r.user;
  },

  async stopImpersonate() {
    const adminT = getAdminToken();
    if (!adminT) return;
    setToken(adminT);
    setAdminToken(null);
    const me = await api.get("/me");
    state.session = me.user;
    await Promise.all([loadPlanos(), loadUserData()]);
  },

  async adminCreateClient(payload) {
    await api.post("/admin/clients", payload, { useAdmin: true });
    await store.adminLoad();
  },

  async adminUpdateClient(id, patch) {
    await api.patch(`/admin/clients/${id}`, patch, { useAdmin: true });
    await store.adminLoad();
  },

  async adminAddDays(id, days) {
    await api.post(`/admin/clients/${id}/days`, { days }, { useAdmin: true });
    await store.adminLoad();
  },

  async adminSetStatus(id, status) {
    await api.post(`/admin/clients/${id}/status`, { status }, { useAdmin: true });
    await store.adminLoad();
  },

  async adminSetPassword(id, senha) {
    await api.post(`/admin/clients/${id}/password`, { senha }, { useAdmin: true });
  },

  async generateLicenses(payload) {
    const r = await api.post("/admin/licenses", payload, { useAdmin: true });
    await store.adminLoad();
    return r.licenses;
  },

  async useLicenseManual(id) {
    const lic = state.adminLicenses.find((l) => l.id === id);
    const status = lic?.status === "disponivel" ? "usada" : "disponivel";
    await api.patch(`/admin/licenses/${id}`, { status }, { useAdmin: true });
    await store.adminLoad();
  },

  async setLicensePrice(id, preco, comprador) {
    await api.patch(`/admin/licenses/${id}`, { preco, comprador }, { useAdmin: true });
    await store.adminLoad();
  },

  async setPlanos(planos) {
    const r = await api.put("/admin/plans", { planos }, { useAdmin: true });
    state.planos = r.planos || planos;
  },

  /* ===================== MUTACOES DOS DADOS ===================== */

  addAcesso({ cliente, valor, dia, mes, ano }) {
    assertCan("access.create");
    const item = { id: uid(), tipo: "acesso", cliente, valor: Number(valor), dia: Number(dia), mes, ano: Number(ano), ts: Date.now(), ...actorStamp() };
    mutate((d) => {
      d.acessos.push(item);
      d.lastAcesso = { nome: cliente, valor: Number(valor), dia, mes, ano };
    });
    return item;
  },

  addVenda({ cliente, valor, itens, dia, mes, ano }) {
    assertCan("sales.create");
    const custo = itens.reduce((s, i) => s + Number(i.custo) * Number(i.quantidade), 0);
    const item = {
      id: uid(), tipo: "venda", cliente, valor: Number(valor), custo,
      lucro: Number(valor) - custo, itens, dia: Number(dia), mes, ano: Number(ano), ts: Date.now(),
      ...actorStamp(),
    };
    mutate((d) => {
      d.vendas.push(item);
      d.lastVenda = { nome: cliente, valor: Number(valor), dia, mes, ano };
    });
    return item;
  },

  addRecrutamento({ nome, tipo, dia, mes, ano }) {
    assertCan("customers.create");
    const item = { id: uid(), nome, tipo, dia: Number(dia), mes, ano: Number(ano), ts: Date.now(), ...actorStamp() };
    mutate((d) => d.recrutamento.push(item));
    return item;
  },

  removeById(collection, id, { status = "cancelada", motivo = "" } = {}) {
    if (collection === "vendas") assertCan(status === "estornada" ? "sales.refund" : "sales.cancel");
    else if (collection === "acessos") assertCan("access.delete");
    else if (collection === "historicoInventario") assertCan("inventory.edit");
    else if (collection === "cartelaMovs") assertCan("cards.cancel");
    else if (collection === "enviosCusto") assertCan("cash.reopen");
    else if (collection === "recrutamento") assertCan("customers.delete");
    mutate((d) => {
      const list = d[collection] || [];
      if (collection === "vendas" || collection === "acessos" || collection === "historicoInventario" || collection === "cartelaMovs" || collection === "enviosCusto") {
        d[collection] = list.map((x) => {
          if (x.id !== id) return x;
          const a = state.actor;
          return {
            ...x,
            status,
            motivo: motivo || x.motivo,
            deletedBy: a?.id,
            deletedByName: a?.nome,
            deletedAt: Date.now(),
            updatedBy: a?.id,
            updatedByName: a?.nome,
            updatedAt: Date.now(),
          };
        });
        return;
      }
      d[collection] = list.filter((x) => x.id !== id);
    });
  },

  refundVenda(id, motivo = "") {
    store.removeById("vendas", id, { status: "estornada", motivo });
  },

  setMetas(ano, mes, metas) {
    mutate((d) => { d.metas[`${ano}-${mes}`] = metas; });
  },

  getMetas(ano, mes) {
    return state.data?.metas?.[`${ano}-${mes}`] || { d: 0, s: 0 };
  },

  setPerfil(patch) {
    assertCan("settings.edit");
    mutate((d) => Object.assign(d.perfil, patch));
  },

  addPesquisa(p) {
    assertCan("customers.create");
    const item = { id: uid(), ts: Date.now(), ...actorStamp(), ...p };
    mutate((d) => d.pesquisas.unshift(item));
    return item;
  },

  addEnvioCusto({ dia, mes, ano, valor }) {
    assertCan("cash.close");
    const item = { id: uid(), dia: Number(dia), mes, ano: Number(ano), valor: Number(valor), ts: Date.now(), ...actorStamp() };
    mutate((d) => d.enviosCusto.push(item));
    return item;
  },

  setInventario(rows) {
    assertCan("inventory.adjust");
    mutate((d) => { d.inventario = rows; });
  },

  addHistoricoInventario(snap) {
    assertCan("inventory.purchase");
    mutate((d) => d.historicoInventario.unshift({ id: uid(), ts: Date.now(), ...actorStamp(), ...snap }));
  },

  updateHistoricoInventario(id, patch) {
    assertCan("inventory.edit");
    mutate((d) => {
      const item = (d.historicoInventario || []).find((x) => x.id === id);
      if (item) Object.assign(item, patch);
    });
  },

  addCartela({ cliente, quantidade }) {
    assertCan("cards.create");
    mutate((d) => {
      d.cartelas = d.cartelas || [];
      d.cartelaMovs = d.cartelaMovs || [];
      const existing = d.cartelas.find((c) => c.cliente.toLowerCase() === cliente.toLowerCase());
      const qtd = Number(quantidade) || 0;
      if (existing) existing.saldo += qtd;
      else d.cartelas.push({ id: uid(), cliente, saldo: qtd });
      const saldo = (existing ? existing.saldo : qtd);
      d.cartelaMovs.push({ id: uid(), cliente, tipo: "compra", qtd, saldo, ts: Date.now(), ...actorStamp() });
    });
  },

  useCartela(cliente) {
    assertCan("cards.use");
    mutate((d) => {
      d.cartelas = d.cartelas || [];
      d.cartelaMovs = d.cartelaMovs || [];
      const existing = d.cartelas.find((c) => c.cliente.toLowerCase() === cliente.toLowerCase());
      if (!existing) return;
      existing.saldo -= 1;
      d.cartelaMovs.push({ id: uid(), cliente, tipo: "uso", qtd: 1, saldo: existing.saldo, ts: Date.now(), ...actorStamp() });
    });
  },

  removeCartelaMov(id) {
    assertCan("cards.cancel");
    mutate((d) => {
      d.cartelas = d.cartelas || [];
      d.cartelaMovs = d.cartelaMovs || [];
      const mov = d.cartelaMovs.find((x) => x.id === id);
      if (!mov) return;
      const a = state.actor;
      mov.status = "cancelada";
      mov.deletedBy = a?.id;
      mov.deletedByName = a?.nome;
      mov.deletedAt = Date.now();
      const nome = mov.cliente;
      const movs = d.cartelaMovs
        .filter((m) => m.cliente.toLowerCase() === nome.toLowerCase() && (!m.status || m.status === "ativo"))
        .sort((a, b) => a.ts - b.ts);
      let saldo = 0;
      movs.forEach((m) => {
        saldo += m.tipo === "compra" ? Number(m.qtd) || 0 : -(Number(m.qtd) || 0);
        m.saldo = saldo;
      });
      const cart = d.cartelas.find((c) => c.cliente.toLowerCase() === nome.toLowerCase());
      if (cart) cart.saldo = saldo;
    });
  },

  updateAcesso(id, patch) {
    mutate((d) => {
      const item = d.acessos.find((x) => x.id === id);
      if (item) Object.assign(item, patch);
    });
  },

  updateVenda(id, patch) {
    mutate((d) => {
      const item = d.vendas.find((x) => x.id === id);
      if (item) Object.assign(item, patch);
    });
  },

  setFechamentoFlag(ano, mes, dia, plus) {
    assertCan("cash.close");
    mutate((d) => {
      d.fechamentoFlags = d.fechamentoFlags || {};
      d.fechamentoFlags[`${ano}-${mes}-${dia}`] = !!plus;
    });
  },

  getFechamentoFlag(ano, mes, dia) {
    const flags = state.data?.fechamentoFlags || {};
    const k = `${ano}-${mes}-${dia}`;
    return flags[k] !== undefined ? flags[k] : true;
  },

  async addColaborador({ nome, email, senha, perfil, permissions }) {
    const r = await api.post("/colaboradores", { nome, email, senha, perfil, permissions });
    if (state.data) {
      state.data.colaboradores = state.data.colaboradores || [];
      state.data.colaboradores.push(r.colaborador);
    }
    return r.colaborador;
  },

  async updateColaborador(id, patch) {
    const r = await api.patch(`/colaboradores/${id}`, patch);
    if (state.data) {
      state.data.colaboradores = (state.data.colaboradores || []).map((c) => (c.id === id ? r.colaborador : c));
    }
    return r.colaborador;
  },

  async removeColaborador(id) {
    const r = await api.del(`/colaboradores/${id}`);
    if (state.data) {
      state.data.colaboradores = (state.data.colaboradores || []).map((c) => (c.id === id ? r.colaborador : c));
    }
  },

  async loadAudit(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const path = `/audit${q.toString() ? `?${q}` : ""}`;
    const r = await api.get(path);
    return r.logs || [];
  },

  setGanhoManual(ano, mes, field, value) {
    assertCan("reports.financial");
    mutate((d) => {
      const key = `${ano}-${mes}`;
      d.ganhosManuais[key] = d.ganhosManuais[key] || { royalties: 0, bonus: 0, pv: 0 };
      d.ganhosManuais[key][field] = Number(value) || 0;
    });
  },

  setContas(contas) {
    assertCan("finance.edit");
    mutate((d) => { d.contas = contas; });
  },

  resetContas() {
    assertCan("finance.edit");
    mutate((d) => {
      d.contas = [
        { id: "clf", sigla: "CLF", nome: "Liberdade Financeira", pct: 10 },
        { id: "aqb", sigla: "AQB", nome: "Aquisicao de bens", pct: 10 },
        { id: "sis", sigla: "SIS", nome: "Sistema", pct: 10 },
        { id: "nec", sigla: "NEC", nome: "Necessidades Basicas", pct: 50 },
        { id: "play", sigla: "PLAY", nome: "Diversao", pct: 10 },
        { id: "doa", sigla: "DOA", nome: "Doacao", pct: 10 },
      ];
    });
  },

  setEntradasGestao(patch) {
    assertCan("finance.edit");
    mutate((d) => Object.assign(d.entradasGestao, patch));
  },

  setPrecificador(rows) {
    assertCan("pricing.edit");
    mutate((d) => { d.precificador = rows; });
  },
};


