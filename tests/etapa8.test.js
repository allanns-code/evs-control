import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "evs-e8-")), "data.sqlite");

const { resolvePermissions, can, PROFILE_DEFAULTS } = await import("../shared/permissions.js");
const { authorizeDataPatch, ForbiddenError } = await import("../server/guard.js");
const {
  insertUser, hashPassword, db, uid, writeAudit, listAudit, seed,
} = await import("../server/db.js");
const { tokenPayload, buildActor, signToken } = await import("../server/auth.js");

seed();

function ownerActor(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    type: "owner",
    perfil: "proprietario",
    permissions: resolvePermissions("proprietario"),
    ownerId: user.id,
  };
}

function colabActor(colab, owner, perfil = "atendente", overrides = {}) {
  return {
    id: colab.id,
    nome: colab.nome,
    email: colab.email,
    type: "colaborador",
    perfil,
    permissions: resolvePermissions(perfil, overrides),
    ownerId: owner.id,
  };
}

test("atendente nao tem sales.cancel por padrao", () => {
  const perms = resolvePermissions("atendente");
  assert.equal(can(perms, "sales.create"), true);
  assert.equal(can(perms, "sales.cancel"), false);
  assert.equal(can(perms, "sales.refund"), false);
  assert.equal(can(perms, "audit.view"), false);
});

test("gerente cria venda e nao cancela por padrao", () => {
  const perms = resolvePermissions("gerente");
  assert.equal(can(perms, "sales.create"), true);
  assert.equal(can(perms, "sales.cancel"), false);
  assert.equal(can(perms, "cash.close"), true);
});

test("atendente excluir venda retorna 403", () => {
  const owner = { id: "u1", nome: "Dono" };
  const sale = { id: "v1", cliente: "Ana", valor: 100, status: "ativo", ts: 1 };
  const current = { perfil: {}, vendas: [sale], acessos: [] };
  const incoming = { vendas: [] };
  const actor = colabActor({ id: "c1", nome: "Joao", email: "j@x.com" }, owner, "atendente");
  assert.throws(() => authorizeDataPatch(current, incoming, actor), ForbiddenError);
});

test("gerente cria venda com actor e auditoria", () => {
  const owner = { id: "u2", nome: "Dono" };
  const current = { perfil: {}, vendas: [], acessos: [] };
  const sale = { id: "v2", cliente: "Bruno", valor: 80, ts: Date.now() };
  const actor = colabActor({ id: "c2", nome: "Maria", email: "m@x.com" }, owner, "gerente");
  const { merged, events } = authorizeDataPatch(current, { vendas: [sale] }, actor);
  assert.equal(merged.vendas.length, 1);
  assert.equal(merged.vendas[0].createdBy, "c2");
  assert.equal(merged.vendas[0].createdByName, "Maria");
  assert.equal(events[0].action, "CREATE_SALE");
  assert.equal(events[0].recordLabel, "Bruno");
});

test("estoque identifica usuario no ajuste", () => {
  const owner = { id: "u3", nome: "Dono" };
  const current = { perfil: {}, inventario: [{ id: "i1", nome: "Shake", fechado: 2, aberto: 0 }] };
  const incoming = { inventario: [{ id: "i1", nome: "Shake", fechado: 5, aberto: 0 }] };
  const actor = colabActor({ id: "c3", nome: "Paulo", email: "p@x.com" }, owner, "gerente");
  const { merged, events } = authorizeDataPatch(current, incoming, actor);
  assert.equal(merged.inventario[0].updatedByName, "Paulo");
  assert.equal(events[0].action, "STOCK_ADJUSTMENT");
});

test("dono altera permissao de colaborador e registra auditoria", () => {
  const user = insertUser({ nome: "Dona", email: `dona-${Date.now()}@evs.test`, senha: "1234" });
  const cid = uid("c_");
  db.prepare(
    "INSERT INTO colaboradores (id, owner_id, nome, email, senha, created_at, perfil, status, permissions) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(cid, user.id, "Ana", `ana-${Date.now()}@evs.test`, hashPassword("abcd"), Date.now(), "atendente", "ativo", "{}");
  const before = { salesCancel: false };
  const after = { salesCancel: true };
  writeAudit({
    ownerId: user.id,
    actor: ownerActor(user),
    action: "PERMISSION_CHANGED",
    module: "Equipe",
    recordId: cid,
    recordLabel: "Ana",
    before,
    after,
    extra: { confirmed: true },
  });
  const logs = listAudit(user.id, { q: "Ana" });
  assert.ok(logs.some((l) => l.action === "PERMISSION_CHANGED" && l.recordLabel === "Ana"));
});

test("colaborador inativo nao monta actor ativo", () => {
  const user = insertUser({ nome: "Dono2", email: `dono2-${Date.now()}@evs.test`, senha: "1234" });
  const cid = uid("c_");
  db.prepare(
    "INSERT INTO colaboradores (id, owner_id, nome, email, senha, created_at, perfil, status, permissions) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(cid, user.id, "Inativo", `inativo-${Date.now()}@evs.test`, hashPassword("abcd"), Date.now(), "atendente", "inativo", "{}");
  const token = signToken(tokenPayload(user, { id: cid, type: "colaborador", perfil: "atendente" }));
  assert.ok(token);
  const actor = buildActor({ id: user.id, role: "cliente", actorType: "colaborador", colaboradorId: cid });
  assert.equal(actor.blocked, true);
  assert.equal(actor.reason, "inativo");
});

test("token de colaborador nao passa adminRequired", () => {
  const perms = resolvePermissions("gerente");
  assert.equal(can(perms, "team.permissions"), false);
  assert.equal(PROFILE_DEFAULTS.atendente["sales.cancel"], false);
});
