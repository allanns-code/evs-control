import jwt from "jsonwebtoken";
import { getJwtSecret, getUserById, db, publicColaborador, parsePermissions } from "./db.js";
import { resolvePermissions } from "../shared/permissions.js";

const EXPIRES = "30d";

function secret() {
  return getJwtSecret();
}

export function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: EXPIRES });
}

export function tokenPayload(user, actor) {
  const base = { id: user.id, role: user.role, actorType: actor?.type || (user.role === "admin" ? "admin" : "owner") };
  if (actor?.type === "colaborador") {
    base.colaboradorId = actor.id;
    base.perfil = actor.perfil;
  }
  return base;
}

export function buildActor(auth) {
  const owner = getUserById(auth.id);
  if (!owner) return null;
  if (auth.actorType === "colaborador" && auth.colaboradorId) {
    const c = db.prepare("SELECT * FROM colaboradores WHERE id = ? AND owner_id = ?").get(auth.colaboradorId, owner.id);
    if (!c) return null;
    if (c.status !== "ativo") return { blocked: true, reason: c.status };
    const perfil = c.perfil || "atendente";
    const overrides = parsePermissions(c.permissions);
    return {
      id: c.id,
      nome: c.nome,
      email: c.email,
      type: "colaborador",
      perfil,
      status: c.status,
      permissions: resolvePermissions(perfil, overrides),
      overrides,
      ownerId: owner.id,
      owner,
    };
  }
  const type = owner.role === "admin" ? "admin" : "owner";
  return {
    id: owner.id,
    nome: owner.nome,
    email: owner.email,
    type,
    perfil: "proprietario",
    status: "ativo",
    permissions: resolvePermissions("proprietario"),
    overrides: {},
    ownerId: owner.id,
    owner,
  };
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, mensagem: "Token ausente." });
  try {
    req.auth = jwt.verify(token, secret());
    const actor = buildActor(req.auth);
    if (!actor) return res.status(401).json({ ok: false, mensagem: "Token invalido" });
    if (actor.blocked) {
      return res.status(403).json({ ok: false, mensagem: actor.reason === "bloqueado" ? "Colaborador bloqueado." : "Colaborador inativo." });
    }
    req.actor = actor;
    next();
  } catch {
    return res.status(401).json({ ok: false, mensagem: "Token invalido" });
  }
}

export function adminRequired(req, res, next) {
  if (!req.auth || req.auth.role !== "admin" || req.actor?.type === "colaborador") {
    return res.status(403).json({ ok: false, mensagem: "Acesso restrito ao administrador." });
  }
  next();
}

export function requirePerm(key) {
  return (req, res, next) => {
    if (req.actor?.type === "owner" || req.actor?.type === "admin") return next();
    if (req.actor?.permissions?.[key]) return next();
    return res.status(403).json({ ok: false, mensagem: "Operacao nao autorizada." });
  };
}

export { publicColaborador };
