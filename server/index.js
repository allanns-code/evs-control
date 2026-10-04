import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  db, seed, getUserByEmail, getUserById, getUserData, setUserData, insertUser,
  hashPassword, verifyPassword, getPlanos, setConfig, planoByKey, uid, publicUser,
  writeAudit, listAudit, publicColaborador, parsePermissions,
} from "./db.js";
import { signToken, authRequired, adminRequired, tokenPayload } from "./auth.js";
import { authorizeDataPatch, redactData, ForbiddenError } from "./guard.js";
import { resolvePermissions, PERMISSION_GROUPS, PROFILES } from "../shared/permissions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "EVS Control", time: Date.now() });
});

seed();

const wrap = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (err) {
    const status = err.status || (err instanceof ForbiddenError ? 403 : 400);
    if (status >= 500) console.error(err);
    res.status(status).json({ ok: false, mensagem: err.message || "Erro inesperado" });
  }
};

function assertPerm(req, key) {
  if (req.actor?.type === "owner" || req.actor?.type === "admin") return;
  if (req.actor?.permissions?.[key]) return;
  throw new ForbiddenError();
}

function actorPayload(req) {
  const a = req.actor;
  if (!a) return null;
  return {
    id: a.id,
    nome: a.nome,
    email: a.email,
    type: a.type,
    perfil: a.perfil,
    permissions: a.permissions,
  };
}

function monthlyValue(preco, dias) {
  return (Number(preco) || 0) / ((Number(dias) || 30) / 30);
}

function adminListClients() {
  const now = Date.now();
  const users = db.prepare("SELECT * FROM users WHERE role != 'admin'").all();
  return users
    .map((u) => {
      const d = getUserData(u.id) || {};
      const p = d.perfil || {};
      const dias = p.validoAte ? Math.ceil((p.validoAte - now) / 86400000) : 0;
      const suspenso = p.status === "suspenso";
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        criadoPorAdmin: !!u.criado_por_admin,
        createdAt: u.created_at,
        perfil: p,
        dias,
        ativo: !suspenso && dias > 0,
        vencido: dias <= 0,
        expirando: dias > 0 && dias <= 7,
        faturamento: (d.vendas || []).reduce((s, v) => s + Number(v.valor), 0),
        acessos: (d.acessos || []).length,
      };
    })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}

function adminStats() {
  const list = adminListClients();
  const planos = getPlanos();
  const lic = db.prepare("SELECT * FROM licenses").all();
  let ativos = 0, vencidos = 0, expirando = 0, suspensos = 0, mrr = 0;
  list.forEach((c) => {
    if (c.perfil.status === "suspenso") suspensos++;
    if (c.dias <= 0) vencidos++;
    else if (c.ativo) ativos++;
    if (c.expirando && c.ativo) expirando++;
    if (c.ativo) {
      const plano = planos.find((p) => p.key === c.perfil.planoKey);
      if (plano) mrr += monthlyValue(plano.preco, plano.dias);
    }
  });
  const usadas = lic.filter((l) => l.status === "usada");
  const disponiveis = lic.filter((l) => l.status === "disponivel");
  return {
    clientes: list.length,
    ativos, vencidos, expirando, suspensos, mrr,
    receita: usadas.reduce((s, l) => s + Number(l.preco || 0), 0),
    licencasDisponiveis: disponiveis.length,
    licencasVendidas: usadas.length,
    receitaPrevista: disponiveis.reduce((s, l) => s + Number(l.preco || 0), 0),
  };
}

/* ============================ AUTH ============================ */

app.post("/api/auth/register", wrap((req, res) => {
  const { nome, email, senha, indicadoPor, licenca } = req.body || {};
  if (!nome || !email || !senha) throw new Error("Informe nome, e-mail e senha.");
  const mail = String(email).trim().toLowerCase();
  if (getUserByEmail(mail)) throw new Error("Ja existe uma conta com este e-mail.");

  let lic = null;
  if (licenca) {
    const code = String(licenca).trim().toUpperCase();
    lic = db.prepare("SELECT * FROM licenses WHERE code = ? AND status = 'disponivel'").get(code);
    if (!lic) throw new Error("Codigo de licenca invalido ou ja utilizado.");
  }

  const user = insertUser({ nome: String(nome).trim(), email: mail, senha, indicadoPor: indicadoPor ? String(indicadoPor).toLowerCase() : null });

  let data = getUserData(user.id);
  if (lic) {
    const plano = planoByKey(lic.plano_key);
    data.perfil.planoKey = plano.key;
    data.perfil.plano = plano.nome;
    data.perfil.status = "ativo";
    data.perfil.validoAte = Date.now() + (lic.dias || plano.dias) * 86400000;
    setUserData(user.id, data);
    db.prepare("UPDATE licenses SET status='usada', used_at=?, user_id=?, comprador=COALESCE(NULLIF(comprador,''), ?) WHERE id=?")
      .run(Date.now(), user.id, String(nome).trim(), lic.id);
  } else {
    const trial = planoByKey("trial");
    data.perfil.planoKey = trial.key;
    data.perfil.plano = trial.nome;
    data.perfil.validoAte = Date.now() + trial.dias * 86400000;
    setUserData(user.id, data);
  }

  if (indicadoPor) {
    const ref = getUserByEmail(indicadoPor);
    if (ref && ref.role !== "admin") {
      const rd = getUserData(ref.id);
      if (rd) {
        rd.perfil.indicacoes = (rd.perfil.indicacoes || 0) + 1;
        rd.perfil.validoAte = (rd.perfil.validoAte || Date.now()) + 30 * 86400000;
        setUserData(ref.id, rd);
      }
    }
  }

  const actor = { id: user.id, nome: user.nome, type: user.role === "admin" ? "admin" : "owner" };
  res.json({
    ok: true,
    token: signToken(tokenPayload(user, actor)),
    user: publicUser(user),
    actor: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      type: actor.type,
      perfil: "proprietario",
      permissions: resolvePermissions("proprietario"),
    },
  });
}));

app.post("/api/auth/login", wrap((req, res) => {
  const { email, senha } = req.body || {};
  const user = getUserByEmail(String(email || "").trim().toLowerCase());
  if (!user || !verifyPassword(senha, user.senha)) throw new Error("E-mail ou senha invalidos.");
  if (user.role === "cliente") {
    const d = getUserData(user.id);
    if (d?.perfil?.status === "suspenso") throw new Error("Conta suspensa. Fale com o administrador.");
  }
  const actor = { id: user.id, nome: user.nome, type: user.role === "admin" ? "admin" : "owner" };
  writeAudit({ ownerId: user.id, actor, action: "LOGIN", module: "Auth" });
  res.json({
    ok: true,
    token: signToken(tokenPayload(user, actor)),
    user: publicUser(user),
    actor: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      type: actor.type,
      perfil: "proprietario",
      permissions: resolvePermissions("proprietario"),
    },
  });
}));

app.post("/api/auth/login-colaborador", wrap((req, res) => {
  const { email, senha } = req.body || {};
  const mail = String(email || "").trim().toLowerCase();
  const rows = db.prepare("SELECT * FROM colaboradores WHERE email = ?").all(mail);
  for (const c of rows) {
    if (verifyPassword(senha, c.senha)) {
      const owner = getUserById(c.owner_id);
      if (!owner) continue;
      const status = c.status || "ativo";
      if (status === "bloqueado") throw new Error("Colaborador bloqueado.");
      if (status !== "ativo") throw new Error("Colaborador inativo.");
      db.prepare("UPDATE colaboradores SET last_login = ? WHERE id = ?").run(Date.now(), c.id);
      const perfil = c.perfil || "atendente";
      const actor = { id: c.id, nome: c.nome, type: "colaborador", perfil };
      writeAudit({ ownerId: owner.id, actor, action: "LOGIN", module: "Auth" });
      const permissions = resolvePermissions(perfil, parsePermissions(c.permissions));
      res.json({
        ok: true,
        token: signToken(tokenPayload(owner, actor)),
        user: publicUser(owner),
        colaborador: publicColaborador(c),
        actor: {
          id: c.id,
          nome: c.nome,
          email: c.email,
          type: "colaborador",
          perfil,
          permissions,
        },
      });
      return;
    }
  }
  throw new Error("Colaborador nao encontrado.");
}));

app.post("/api/auth/logout", authRequired, wrap((req, res) => {
  writeAudit({ ownerId: req.actor.ownerId, actor: req.actor, action: "LOGOUT", module: "Auth" });
  res.json({ ok: true });
}));

app.post("/api/auth/recover", wrap((req, res) => {
  const user = getUserByEmail(String(req.body?.email || "").trim().toLowerCase());
  if (!user) throw new Error("Conta nao encontrada.");
  res.json({ ok: true, nome: user.nome });
}));

app.get("/api/plans", wrap((_req, res) => {
  res.json({ ok: true, planos: getPlanos() });
}));

/* ============================ DADOS DO USUARIO ============================ */

app.get("/api/me", authRequired, wrap((req, res) => {
  const user = getUserById(req.auth.id);
  if (!user) throw new Error("Usuario nao encontrado.");
  res.json({
    ok: true,
    user: publicUser(user),
    actor: actorPayload(req),
    permissionGroups: PERMISSION_GROUPS,
    profiles: PROFILES,
  });
}));

app.post("/api/me/password", authRequired, wrap((req, res) => {
  if (req.actor?.type === "colaborador") throw new ForbiddenError();
  const { senhaAtual, senhaNova } = req.body || {};
  if (!senhaAtual || !senhaNova) throw new Error("Informe a senha atual e a nova senha.");
  if (String(senhaNova).length < 4) throw new Error("A nova senha deve ter pelo menos 4 caracteres.");
  const user = getUserById(req.auth.id);
  if (!user) throw new Error("Usuario nao encontrado.");
  if (!verifyPassword(senhaAtual, user.senha)) throw new Error("Senha atual incorreta.");
  db.prepare("UPDATE users SET senha = ? WHERE id = ?").run(hashPassword(senhaNova), user.id);
  res.json({ ok: true });
}));

app.get("/api/data", authRequired, wrap((req, res) => {
  const data = getUserData(req.auth.id);
  if (!data) throw new Error("Dados nao encontrados.");
  const cols = db.prepare("SELECT id, nome, email, perfil, status, permissions, created_at, last_login FROM colaboradores WHERE owner_id = ?").all(req.auth.id);
  data.colaboradores = cols.map(publicColaborador);
  res.json({ ok: true, data: redactData(data, req.actor), actor: actorPayload(req) });
}));

app.put("/api/data", authRequired, wrap((req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== "object") throw new Error("Dados invalidos.");
  const current = getUserData(req.auth.id) || {};
  const { merged, events } = authorizeDataPatch(current, data, req.actor);
  setUserData(req.auth.id, merged);
  events.forEach((ev) => {
    writeAudit({
      ownerId: req.actor.ownerId,
      actor: req.actor,
      action: ev.action,
      module: ev.module,
      recordId: ev.recordId,
      recordLabel: ev.recordLabel,
      before: ev.before,
      after: ev.after,
      extra: ev.confirmed ? { confirmed: true } : null,
    });
  });
  res.json({ ok: true });
}));

app.get("/api/colaboradores", authRequired, wrap((req, res) => {
  assertPerm(req, "team.view");
  const rows = db.prepare("SELECT * FROM colaboradores WHERE owner_id = ? ORDER BY created_at DESC").all(req.auth.id);
  res.json({ ok: true, colaboradores: rows.map(publicColaborador) });
}));

app.post("/api/colaboradores", authRequired, wrap((req, res) => {
  assertPerm(req, "team.create");
  const { nome, email, senha, perfil = "atendente", permissions = {} } = req.body || {};
  if (!nome || !email || !senha) throw new Error("Informe nome, e-mail e senha.");
  const mail = String(email).trim().toLowerCase();
  const exists = db.prepare("SELECT id FROM colaboradores WHERE email = ? AND owner_id = ?").get(mail, req.auth.id);
  if (exists) throw new Error("Ja existe colaborador com este e-mail.");
  const role = perfil === "gerente" ? "gerente" : "atendente";
  const id = uid("c_");
  db.prepare(
    "INSERT INTO colaboradores (id, owner_id, nome, email, senha, created_at, perfil, status, permissions) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, req.auth.id, nome, mail, hashPassword(senha), Date.now(), role, "ativo", JSON.stringify(permissions || {}));
  const colaborador = publicColaborador(db.prepare("SELECT * FROM colaboradores WHERE id = ?").get(id));
  writeAudit({
    ownerId: req.actor.ownerId,
    actor: req.actor,
    action: "CREATE_COLLABORATOR",
    module: "Equipe",
    recordId: id,
    recordLabel: nome,
    after: colaborador,
  });
  res.json({ ok: true, colaborador });
}));

app.patch("/api/colaboradores/:id", authRequired, wrap((req, res) => {
  const row = db.prepare("SELECT * FROM colaboradores WHERE id = ? AND owner_id = ?").get(req.params.id, req.auth.id);
  if (!row) throw new Error("Colaborador nao encontrado.");
  const before = publicColaborador(row);
  const { nome, email, senha, perfil, status, permissions } = req.body || {};
  if (permissions !== undefined) assertPerm(req, "team.permissions");
  else assertPerm(req, "team.edit");
  if (nome) db.prepare("UPDATE colaboradores SET nome = ? WHERE id = ?").run(String(nome).trim(), row.id);
  if (email) {
    const mail = String(email).trim().toLowerCase();
    const other = db.prepare("SELECT id FROM colaboradores WHERE email = ? AND owner_id = ? AND id != ?").get(mail, req.auth.id, row.id);
    if (other) throw new Error("Ja existe colaborador com este e-mail.");
    db.prepare("UPDATE colaboradores SET email = ? WHERE id = ?").run(mail, row.id);
  }
  if (senha) {
    if (String(senha).length < 4) throw new Error("A senha deve ter pelo menos 4 caracteres.");
    db.prepare("UPDATE colaboradores SET senha = ? WHERE id = ?").run(hashPassword(senha), row.id);
  }
  if (perfil) {
    const role = perfil === "gerente" ? "gerente" : "atendente";
    db.prepare("UPDATE colaboradores SET perfil = ? WHERE id = ?").run(role, row.id);
  }
  if (status) {
    const st = ["ativo", "inativo", "bloqueado"].includes(status) ? status : "ativo";
    db.prepare("UPDATE colaboradores SET status = ? WHERE id = ?").run(st, row.id);
  }
  if (permissions !== undefined) {
    db.prepare("UPDATE colaboradores SET permissions = ? WHERE id = ?").run(JSON.stringify(permissions || {}), row.id);
  }
  const after = publicColaborador(db.prepare("SELECT * FROM colaboradores WHERE id = ?").get(row.id));
  writeAudit({
    ownerId: req.actor.ownerId,
    actor: req.actor,
    action: permissions !== undefined ? "PERMISSION_CHANGED" : "EDIT_COLLABORATOR",
    module: "Equipe",
    recordId: row.id,
    recordLabel: after.nome,
    before,
    after,
    extra: { confirmed: true },
  });
  res.json({ ok: true, colaborador: after });
}));

app.delete("/api/colaboradores/:id", authRequired, wrap((req, res) => {
  assertPerm(req, "team.delete");
  const row = db.prepare("SELECT * FROM colaboradores WHERE id = ? AND owner_id = ?").get(req.params.id, req.auth.id);
  if (!row) throw new Error("Colaborador nao encontrado.");
  const before = publicColaborador(row);
  db.prepare("UPDATE colaboradores SET status = 'inativo' WHERE id = ?").run(row.id);
  writeAudit({
    ownerId: req.actor.ownerId,
    actor: req.actor,
    action: "DELETE_COLLABORATOR",
    module: "Equipe",
    recordId: row.id,
    recordLabel: row.nome,
    before,
    after: { ...before, status: "inativo" },
    extra: { confirmed: true },
  });
  res.json({ ok: true, colaborador: { ...before, status: "inativo" } });
}));

app.get("/api/audit", authRequired, wrap((req, res) => {
  assertPerm(req, "audit.view");
  const logs = listAudit(req.auth.id, {
    q: req.query.q,
    module: req.query.module,
    actor: req.query.actor,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
  });
  res.json({ ok: true, logs });
}));

/* ============================ ADMIN ============================ */

app.get("/api/admin/clients", authRequired, adminRequired, wrap((_req, res) => {
  res.json({ ok: true, clients: adminListClients() });
}));

app.get("/api/admin/stats", authRequired, adminRequired, wrap((_req, res) => {
  res.json({ ok: true, stats: adminStats() });
}));

app.post("/api/admin/clients", authRequired, adminRequired, wrap((req, res) => {
  const { nome, email, senha, planoKey, dias, status = "ativo" } = req.body || {};
  if (!nome || !email) throw new Error("Informe nome e e-mail.");
  const mail = String(email).trim().toLowerCase();
  if (getUserByEmail(mail)) throw new Error("E-mail ja cadastrado.");
  const plano = planoByKey(planoKey || "trial");
  const validade = Number(dias) || plano.dias;
  const user = insertUser({ nome: String(nome).trim(), email: mail, senha: senha || "123456", criadoPorAdmin: true });
  const d = getUserData(user.id);
  d.perfil.planoKey = plano.key;
  d.perfil.plano = plano.nome;
  d.perfil.status = status;
  d.perfil.validoAte = Date.now() + validade * 86400000;
  setUserData(user.id, d);
  res.json({ ok: true, client: publicUser(user) });
}));

app.patch("/api/admin/clients/:id", authRequired, adminRequired, wrap((req, res) => {
  const user = getUserById(req.params.id);
  if (!user) throw new Error("Cliente nao encontrado.");
  const { nome, email, status, dias, planoKey } = req.body || {};
  if (nome) db.prepare("UPDATE users SET nome = ? WHERE id = ?").run(nome, user.id);
  if (email) {
    const mail = String(email).trim().toLowerCase();
    const other = getUserByEmail(mail);
    if (other && other.id !== user.id) throw new Error("E-mail ja usado por outro cliente.");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(mail, user.id);
  }
  const d = getUserData(user.id);
  if (d) {
    if (nome) d.perfil.nome = nome;
    if (email) d.perfil.email = String(email).trim().toLowerCase();
    if (status) d.perfil.status = status;
    if (dias != null && dias !== "") d.perfil.validoAte = Date.now() + Number(dias) * 86400000;
    if (planoKey) {
      const plano = planoByKey(planoKey);
      d.perfil.planoKey = plano.key;
      d.perfil.plano = plano.nome;
    }
    setUserData(user.id, d);
  }
  res.json({ ok: true });
}));

app.post("/api/admin/clients/:id/days", authRequired, adminRequired, wrap((req, res) => {
  const d = getUserData(req.params.id);
  if (!d) throw new Error("Cliente nao encontrado.");
  const days = Number(req.body?.days) || 30;
  const base = Math.max(Date.now(), d.perfil.validoAte || 0);
  d.perfil.validoAte = base + days * 86400000;
  d.perfil.status = "ativo";
  setUserData(req.params.id, d);
  res.json({ ok: true });
}));

app.post("/api/admin/clients/:id/status", authRequired, adminRequired, wrap((req, res) => {
  const d = getUserData(req.params.id);
  if (!d) throw new Error("Cliente nao encontrado.");
  d.perfil.status = req.body?.status === "suspenso" ? "suspenso" : "ativo";
  setUserData(req.params.id, d);
  res.json({ ok: true });
}));

app.post("/api/admin/clients/:id/password", authRequired, adminRequired, wrap((req, res) => {
  const senha = req.body?.senha;
  if (!senha) throw new Error("Informe a nova senha.");
  db.prepare("UPDATE users SET senha = ? WHERE id = ?").run(hashPassword(senha), req.params.id);
  res.json({ ok: true });
}));

app.post("/api/admin/impersonate/:id", authRequired, adminRequired, wrap((req, res) => {
  const user = getUserById(req.params.id);
  if (!user) throw new Error("Cliente nao encontrado.");
  const actor = { id: user.id, nome: user.nome, type: user.role === "admin" ? "admin" : "owner" };
  res.json({
    ok: true,
    token: signToken(tokenPayload(user, actor)),
    user: publicUser(user),
  });
}));

app.get("/api/admin/licenses", authRequired, adminRequired, wrap((_req, res) => {
  const licenses = db.prepare("SELECT * FROM licenses ORDER BY created_at DESC").all();
  res.json({ ok: true, licenses });
}));

app.post("/api/admin/licenses", authRequired, adminRequired, wrap((req, res) => {
  const { planoKey, qtd = 1, preco, comprador = "" } = req.body || {};
  const plano = planoByKey(planoKey);
  const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  const stmt = db.prepare(
    "INSERT INTO licenses (id, code, plano_key, plano_nome, dias, preco, comprador, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  const out = [];
  for (let i = 0; i < Number(qtd); i++) {
    const lic = {
      id: uid("l_"),
      code: `MC-${rand()}-${rand()}`,
      planoKey: plano.key,
      planoNome: plano.nome,
      dias: plano.dias,
      preco: preco != null && preco !== "" ? Number(preco) : plano.preco,
      comprador,
      status: "disponivel",
    };
    stmt.run(lic.id, lic.code, lic.planoKey, lic.planoNome, lic.dias, lic.preco, lic.comprador, lic.status, Date.now());
    out.push(lic);
  }
  res.json({ ok: true, licenses: out });
}));

app.patch("/api/admin/licenses/:id", authRequired, adminRequired, wrap((req, res) => {
  const { status, preco, comprador } = req.body || {};
  const lic = db.prepare("SELECT * FROM licenses WHERE id = ?").get(req.params.id);
  if (!lic) throw new Error("Licenca nao encontrada.");
  if (status) {
    db.prepare("UPDATE licenses SET status = ?, used_at = ? WHERE id = ?")
      .run(status, status === "usada" ? Date.now() : null, lic.id);
  }
  if (preco != null) db.prepare("UPDATE licenses SET preco = ? WHERE id = ?").run(Number(preco) || 0, lic.id);
  if (comprador != null) db.prepare("UPDATE licenses SET comprador = ? WHERE id = ?").run(comprador, lic.id);
  res.json({ ok: true });
}));

app.put("/api/admin/plans", authRequired, adminRequired, wrap((req, res) => {
  const planos = req.body?.planos;
  if (!Array.isArray(planos) || !planos.length) throw new Error("Planos invalidos.");
  setConfig("planos", planos);
  res.json({ ok: true, planos });
}));

/* ============================ FRONTEND (producao) ============================ */

const rootDir = join(__dirname, "..");
const dist = join(rootDir, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.log("Frontend nao encontrado. Gerando build...");
  execSync("npx vite build", { stdio: "inherit", cwd: rootDir });
}

app.use(express.static(dist));
app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(dist, "index.html")));

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`EVS Control em http://localhost:${PORT}`);
});
