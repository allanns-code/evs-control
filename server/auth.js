import jwt from "jsonwebtoken";
import { getJwtSecret } from "./db.js";

const EXPIRES = "30d";

function secret() {
  return getJwtSecret();
}

export function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: EXPIRES });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, mensagem: "Token ausente." });
  try {
    req.auth = jwt.verify(token, secret());
    next();
  } catch {
    return res.status(401).json({ ok: false, mensagem: "Token invalido" });
  }
}

export function adminRequired(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") {
    return res.status(403).json({ ok: false, mensagem: "Acesso restrito ao administrador." });
  }
  next();
}
