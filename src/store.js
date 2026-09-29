import { uid } from "./utils.js";
import { api, setToken, getToken, getAdminToken, setAdminToken } from "./api.js";

/* Estrutura mantida compativel com as telas existentes.
   Persistencia agora e online (Express + SQLite). */

const state = {
  session: null,
  data: null,
  planos: [],
  adminClients: [],
  adminStats: null,
  adminLicenses: [],
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

function mutate(fn) {
  if (!state.data) return;
  fn(state.data);
  scheduleSync();
}

export const store = {
  async bootstrap() {
    if (!getToken()) return false;
    try {
      const [me, planos] = await Promise.all([api.get("/me"), api.get("/plans")]);
      state.session = me.user;
      state.planos = planos.planos || [];
      await loadUserData();
      return true;
    } catch {
      setToken(null);
      setAdminToken(null);
      state.session = null;
      state.data = null;
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
  isAdmin() {
    return state.session?.role === "admin";
  },
  isImpersonating() {
    return !!getAdminToken();
  },

  async register({ nome, email, senha, indicadoPor, licenca }) {
    const r = await api.post("/auth/register", { nome, email, senha, indicadoPor, licenca });
    setToken(r.token);
    setAdminToken(null);
    state.session = r.user;
    await Promise.all([loadPlanos(), loadUserData()]);
    return r.user;
  },

  async login(email, senha) {
    const r = await api.post("/auth/login", { email, senha });
    setToken(r.token);
    setAdminToken(null);
    state.session = r.user;
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
    await Promise.all([loadPlanos(), loadUserData()]);
    return r;
  },

  async recover(email) {
    const r = await api.post("/auth/recover", { email });
    return r.nome;
  },

  logout() {
    setToken(null);
    setAdminToken(null);
    state.session = null;
    state.data = null;
    state.colabSession = null;
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
    const item = { id: uid(), tipo: "acesso", cliente, valor: Number(valor), dia: Number(dia), mes, ano: Number(ano), ts: Date.now() };
    mutate((d) => {
      d.acessos.push(item);
      d.lastAcesso = { nome: cliente, valor: Number(valor), dia, mes, ano };
    });
    return item;
  },

  addVenda({ cliente, valor, itens, dia, mes, ano }) {
    const custo = itens.reduce((s, i) => s + Number(i.custo) * Number(i.quantidade), 0);
    const item = {
      id: uid(), tipo: "venda", cliente, valor: Number(valor), custo,
      lucro: Number(valor) - custo, itens, dia: Number(dia), mes, ano: Number(ano), ts: Date.now(),
    };
    mutate((d) => {
      d.vendas.push(item);
      d.lastVenda = { nome: cliente, valor: Number(valor), dia, mes, ano };
    });
    return item;
  },

  addRecrutamento({ nome, tipo, dia, mes, ano }) {
    const item = { id: uid(), nome, tipo, dia: Number(dia), mes, ano: Number(ano), ts: Date.now() };
    mutate((d) => d.recrutamento.push(item));
    return item;
  },

  removeById(collection, id) {
    mutate((d) => { d[collection] = d[collection].filter((x) => x.id !== id); });
  },

  setMetas(ano, mes, metas) {
    mutate((d) => { d.metas[`${ano}-${mes}`] = metas; });
  },

  getMetas(ano, mes) {
    return state.data?.metas?.[`${ano}-${mes}`] || { d: 0, s: 0 };
  },

  setPerfil(patch) {
    mutate((d) => Object.assign(d.perfil, patch));
  },

  addPesquisa(p) {
    const item = { id: uid(), ts: Date.now(), ...p };
    mutate((d) => d.pesquisas.unshift(item));
    return item;
  },

  addEnvioCusto({ dia, mes, ano, valor }) {
    const item = { id: uid(), dia: Number(dia), mes, ano: Number(ano), valor: Number(valor), ts: Date.now() };
    mutate((d) => d.enviosCusto.push(item));
    return item;
  },

  setInventario(rows) {
    mutate((d) => { d.inventario = rows; });
  },

  addHistoricoInventario(snap) {
    mutate((d) => d.historicoInventario.unshift({ id: uid(), ts: Date.now(), ...snap }));
  },

  updateHistoricoInventario(id, patch) {
    mutate((d) => {
      const item = (d.historicoInventario || []).find((x) => x.id === id);
      if (item) Object.assign(item, patch);
    });
  },

  addCartela({ cliente, quantidade }) {
    mutate((d) => {
      d.cartelaMovs = d.cartelaMovs || [];
      const existing = d.cartelas.find((c) => c.cliente.toLowerCase() === cliente.toLowerCase());
      const qtd = Number(quantidade) || 0;
      if (existing) existing.saldo += qtd;
      else d.cartelas.push({ id: uid(), cliente, saldo: qtd });
      const saldo = (existing ? existing.saldo : qtd);
      d.cartelaMovs.push({ id: uid(), cliente, tipo: "compra", qtd, saldo, ts: Date.now() });
    });
  },

  useCartela(cliente) {
    mutate((d) => {
      d.cartelaMovs = d.cartelaMovs || [];
      const existing = d.cartelas.find((c) => c.cliente.toLowerCase() === cliente.toLowerCase());
      if (!existing) return;
      existing.saldo -= 1;
      d.cartelaMovs.push({ id: uid(), cliente, tipo: "uso", qtd: 1, saldo: existing.saldo, ts: Date.now() });
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

  async addColaborador({ nome, email, senha }) {
    const r = await api.post("/colaboradores", { nome, email, senha });
    if (state.data) state.data.colaboradores.push(r.colaborador);
    return r.colaborador;
  },

  async removeColaborador(id) {
    await api.del(`/colaboradores/${id}`);
    if (state.data) state.data.colaboradores = state.data.colaboradores.filter((c) => c.id !== id);
  },

  setGanhoManual(ano, mes, field, value) {
    mutate((d) => {
      const key = `${ano}-${mes}`;
      d.ganhosManuais[key] = d.ganhosManuais[key] || { royalties: 0, bonus: 0, pv: 0 };
      d.ganhosManuais[key][field] = Number(value) || 0;
    });
  },

  setContas(contas) {
    mutate((d) => { d.contas = contas; });
  },

  resetContas() {
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
    mutate((d) => Object.assign(d.entradasGestao, patch));
  },

  setPrecificador(rows) {
    mutate((d) => { d.precificador = rows; });
  },
};


