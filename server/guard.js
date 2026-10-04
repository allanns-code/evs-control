import {
  can, isOwnerActor, COLLECTION_PERMS, OBJECT_PERMS, OWNER_ONLY_PERFIL_KEYS,
} from "../shared/permissions.js";

export class ForbiddenError extends Error {
  constructor(message = "Operacao nao autorizada.") {
    super(message);
    this.status = 403;
    this.code = 403;
  }
}

function indexById(list) {
  const map = new Map();
  (list || []).forEach((item) => {
    if (item && item.id != null) map.set(String(item.id), item);
  });
  return map;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stampNew(item, actor, now) {
  const out = { ...item };
  out.createdBy = actor.id;
  out.createdByName = actor.nome;
  out.createdAt = out.createdAt || out.ts || now;
  if (!out.status) out.status = "ativo";
  return out;
}

function stampEdit(prev, next, actor, now) {
  const out = { ...next };
  out.createdBy = prev.createdBy || out.createdBy;
  out.createdByName = prev.createdByName || out.createdByName;
  out.createdAt = prev.createdAt || out.createdAt;
  out.updatedBy = actor.id;
  out.updatedByName = actor.nome;
  out.updatedAt = now;
  return out;
}

function requirePerm(actor, key) {
  if (isOwnerActor(actor)) return;
  if (!can(actor.permissions, key)) throw new ForbiddenError();
}

function softCancel(prev, actor, now, status) {
  return {
    ...prev,
    status,
    deletedBy: actor.id,
    deletedByName: actor.nome,
    deletedAt: now,
    updatedBy: actor.id,
    updatedByName: actor.nome,
    updatedAt: now,
  };
}

function diffArrays(currentList, incomingList, actor, now, spec, collection) {
  const events = [];
  const curMap = indexById(currentList);
  const incMap = indexById(incomingList);
  const result = [];
  const seen = new Set();

  for (const [id, inc] of incMap) {
    seen.add(id);
    const prev = curMap.get(id);
    if (!prev) {
      requirePerm(actor, spec.add);
      const created = stampNew(inc, actor, now);
      result.push(created);
      events.push({
        action: collectionAction(collection, "create"),
        module: moduleOf(collection),
        recordId: created.id,
        recordLabel: labelOf(created, collection),
        before: null,
        after: snapshot(created),
      });
      continue;
    }
    const incomingStatus = inc.status;
    const wasActive = !prev.status || prev.status === "ativo";
    if (wasActive && (incomingStatus === "estornada" || incomingStatus === "cancelada")) {
      const perm = incomingStatus === "estornada" ? "sales.refund" : spec.remove;
      requirePerm(actor, collection === "vendas" ? perm : spec.remove);
      const cancelled = softCancel(prev, actor, now, incomingStatus);
      if (inc.motivo) cancelled.motivo = String(inc.motivo);
      result.push(cancelled);
      events.push({
        action: incomingStatus === "estornada" ? "REFUND_SALE" : collectionAction(collection, "cancel"),
        module: moduleOf(collection),
        recordId: prev.id,
        recordLabel: labelOf(prev, collection),
        before: snapshot(prev),
        after: snapshot(cancelled),
        confirmed: true,
      });
      continue;
    }
    const comparableInc = { ...inc };
    delete comparableInc.updatedBy;
    delete comparableInc.updatedByName;
    delete comparableInc.updatedAt;
    const comparablePrev = { ...prev };
    delete comparablePrev.updatedBy;
    delete comparablePrev.updatedByName;
    delete comparablePrev.updatedAt;
    if (sameJson(comparablePrev, comparableInc)) {
      result.push(prev);
      continue;
    }
    requirePerm(actor, spec.edit);
    const edited = stampEdit(prev, inc, actor, now);
    result.push(edited);
    events.push({
      action: collectionAction(collection, "edit"),
      module: moduleOf(collection),
      recordId: prev.id,
      recordLabel: labelOf(edited, collection),
      before: snapshot(prev),
      after: snapshot(edited),
    });
  }

  for (const [id, prev] of curMap) {
    if (seen.has(id)) continue;
    if (collection === "vendas" || collection === "acessos" || collection === "historicoInventario" || collection === "cartelaMovs" || collection === "enviosCusto") {
      if (prev.status && prev.status !== "ativo") {
        result.push(prev);
        continue;
      }
      requirePerm(actor, collection === "vendas" ? "sales.cancel" : spec.remove);
      const cancelled = softCancel(prev, actor, now, collection === "vendas" ? "cancelada" : "cancelada");
      result.push(cancelled);
      events.push({
        action: collectionAction(collection, "cancel"),
        module: moduleOf(collection),
        recordId: prev.id,
        recordLabel: labelOf(prev, collection),
        before: snapshot(prev),
        after: snapshot(cancelled),
        confirmed: true,
      });
      continue;
    }
    requirePerm(actor, spec.remove);
    events.push({
      action: collectionAction(collection, "delete"),
      module: moduleOf(collection),
      recordId: prev.id,
      recordLabel: labelOf(prev, collection),
      before: snapshot(prev),
      after: null,
      confirmed: true,
    });
  }

  return { list: result, events };
}

function collectionAction(collection, op) {
  const map = {
    acessos: { create: "CREATE_ACCESS", edit: "EDIT_ACCESS", cancel: "CANCEL_ACCESS", delete: "DELETE_ACCESS" },
    vendas: { create: "CREATE_SALE", edit: "EDIT_SALE", cancel: "CANCEL_SALE", delete: "CANCEL_SALE" },
    recrutamento: { create: "CREATE_CUSTOMER", edit: "EDIT_CUSTOMER", cancel: "DELETE_CUSTOMER", delete: "DELETE_CUSTOMER" },
    pesquisas: { create: "CREATE_CUSTOMER", edit: "EDIT_CUSTOMER", cancel: "DELETE_CUSTOMER", delete: "DELETE_CUSTOMER" },
    inventario: { create: "STOCK_ADJUSTMENT", edit: "STOCK_ADJUSTMENT", cancel: "STOCK_ADJUSTMENT", delete: "STOCK_ADJUSTMENT" },
    historicoInventario: { create: "STOCK_PURCHASE", edit: "STOCK_ADJUSTMENT", cancel: "STOCK_LOSS", delete: "STOCK_LOSS" },
    cartelas: { create: "CREATE_CARD", edit: "CREATE_CARD", cancel: "CANCEL_CARD", delete: "CANCEL_CARD" },
    cartelaMovs: { create: "USE_CARD", edit: "USE_CARD", cancel: "CANCEL_CARD", delete: "CANCEL_CARD" },
    enviosCusto: { create: "CASH_EXPENSE", edit: "CASH_EXPENSE", cancel: "CASH_REOPEN", delete: "CASH_REOPEN" },
    custos: { create: "CASH_EXPENSE", edit: "CASH_EXPENSE", cancel: "CASH_REOPEN", delete: "CASH_REOPEN" },
    precificador: { create: "EDIT_PRICE", edit: "EDIT_PRICE", cancel: "EDIT_PRICE", delete: "EDIT_PRICE" },
    contas: { create: "EDIT_FINANCE", edit: "EDIT_FINANCE", cancel: "EDIT_FINANCE", delete: "EDIT_FINANCE" },
  };
  return map[collection]?.[op] || `${op.toUpperCase()}_${collection.toUpperCase()}`;
}

function moduleOf(collection) {
  const map = {
    acessos: "Acessos",
    vendas: "Vendas",
    recrutamento: "Clientes",
    pesquisas: "Clientes",
    inventario: "Estoque",
    historicoInventario: "Estoque",
    cartelas: "Cartelas",
    cartelaMovs: "Cartelas",
    enviosCusto: "Caixa",
    custos: "Caixa",
    precificador: "Precos",
    contas: "Financeiro",
  };
  return map[collection] || collection;
}

function labelOf(item, collection) {
  if (!item) return collection;
  if (collection === "vendas" || collection === "acessos") return item.cliente || item.id;
  if (collection === "inventario" || collection === "precificador") return item.nome || item.produto || item.id;
  if (collection === "cartelas" || collection === "cartelaMovs") return item.cliente || item.id;
  if (collection === "pesquisas" || collection === "recrutamento") return item.nome || item.id;
  return item.id || collection;
}

function snapshot(item) {
  if (!item) return null;
  const { senha, password, ...rest } = item;
  return rest;
}

function mergePerfil(current, incoming, actor) {
  const cur = current || {};
  const inc = incoming || {};
  if (isOwnerActor(actor)) return { ...cur, ...inc };
  const out = { ...cur };
  const allowed = ["estado", "desconto"];
  let changed = false;
  allowed.forEach((k) => {
    if (inc[k] !== undefined && inc[k] !== cur[k]) {
      requirePerm(actor, "settings.edit");
      out[k] = inc[k];
      changed = true;
    }
  });
  OWNER_ONLY_PERFIL_KEYS.forEach((k) => {
    if (inc[k] !== undefined && String(inc[k]) !== String(cur[k] ?? "")) {
      throw new ForbiddenError();
    }
  });
  return { perfil: out, changed };
}

export function authorizeDataPatch(current, incoming, actor) {
  if (!incoming || typeof incoming !== "object") throw new Error("Dados invalidos.");
  const now = Date.now();
  const events = [];
  const merged = clone(current) || {};

  const skip = new Set(["colaboradores"]);
  Object.keys(incoming).forEach((key) => {
    if (skip.has(key)) return;
    if (incoming[key] === undefined) return;

    if (key === "perfil") {
      const r = mergePerfil(merged.perfil, incoming.perfil, actor);
      merged.perfil = r.perfil;
      if (r.changed) {
        events.push({
          action: "EDIT_SETTINGS",
          module: "Configuracoes",
          recordId: actor.ownerId,
          recordLabel: "perfil",
          before: snapshot(current.perfil),
          after: snapshot(merged.perfil),
        });
      }
      return;
    }

    if (COLLECTION_PERMS[key] && Array.isArray(incoming[key])) {
      const spec = COLLECTION_PERMS[key];
      const { list, events: ev } = diffArrays(current[key] || [], incoming[key], actor, now, spec, key);
      merged[key] = list;
      events.push(...ev);
      return;
    }

    if (OBJECT_PERMS[key]) {
      if (sameJson(current[key] || {}, incoming[key] || {})) return;
      requirePerm(actor, OBJECT_PERMS[key]);
      merged[key] = incoming[key];
      events.push({
        action: key === "fechamentoFlags" ? "CASH_CLOSE" : "EDIT_DATA",
        module: key === "fechamentoFlags" ? "Caixa" : "Dados",
        recordId: key,
        recordLabel: key,
        before: snapshot(current[key]),
        after: snapshot(incoming[key]),
      });
      return;
    }

    if (isOwnerActor(actor)) {
      merged[key] = incoming[key];
    }
  });

  merged.colaboradores = current.colaboradores || [];
  return { merged, events };
}

export function redactData(data, actor) {
  if (!data) return data;
  if (isOwnerActor(actor)) return data;
  const out = clone(data);
  const perms = actor.permissions || {};
  if (!can(perms, "reports.financial")) {
    delete out.ganhosManuais;
  }
  if (!can(perms, "finance.view")) {
    delete out.contas;
    delete out.entradasGestao;
  }
  if (!can(perms, "cash.view")) {
    delete out.enviosCusto;
    delete out.custos;
    delete out.fechamentoFlags;
  }
  if (!can(perms, "inventory.view")) {
    delete out.inventario;
    delete out.historicoInventario;
  }
  if (!can(perms, "cards.view")) {
    delete out.cartelas;
    delete out.cartelaMovs;
  }
  if (!can(perms, "plan.view") && out.perfil) {
    delete out.perfil.planoKey;
    delete out.perfil.plano;
    delete out.perfil.validoAte;
    delete out.perfil.indicacoes;
  }
  if (!can(perms, "team.view")) {
    out.colaboradores = [];
  }
  if (!can(perms, "reports.financial") && Array.isArray(out.vendas)) {
    out.vendas = out.vendas.map((v) => {
      const copy = { ...v };
      if (!can(perms, "reports.financial")) {
        /* keep custo for the sale line; totals are hidden in UI */
      }
      return copy;
    });
  }
  return out;
}
