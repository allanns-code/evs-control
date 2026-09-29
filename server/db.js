import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, "data.sqlite");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cliente',
    criado_por_admin INTEGER NOT NULL DEFAULT 0,
    indicado_por TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS colaboradores (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    senha TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    plano_key TEXT NOT NULL,
    plano_nome TEXT NOT NULL,
    dias INTEGER NOT NULL,
    preco REAL NOT NULL DEFAULT 0,
    comprador TEXT,
    status TEXT NOT NULL DEFAULT 'disponivel',
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_colab_email ON colaboradores(email);
  CREATE INDEX IF NOT EXISTS idx_lic_status ON licenses(status);
`);

export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(pw), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(String(pw), salt, 64);
  const original = Buffer.from(hash, "hex");
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}

export function uid(prefix = "") {
  return `${prefix}${randomUUID()}`;
}

export const DEFAULT_PLANOS = [
  { key: "trial", nome: "Trial 21 dias", preco: 0, dias: 21, desc: "Teste gratis para novos clientes" },
  { key: "mensal", nome: "Mensal", preco: 7.9, dias: 30, desc: "Acesso por 30 dias" },
  { key: "trimestral", nome: "Trimestral", preco: 19.9, dias: 90, desc: "Acesso por 90 dias" },
  { key: "semestral", nome: "Semestral", preco: 35.9, dias: 180, desc: "Acesso por 180 dias" },
  { key: "anual", nome: "Anual", preco: 69.9, dias: 365, desc: "Acesso por 365 dias" },
];

function getConfig(key, fallback) {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setConfig(key, value) {
  db.prepare(
    "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

export function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let secret = getConfig("jwt_secret", null);
  if (!secret) {
    secret = randomBytes(48).toString("hex");
    setConfig("jwt_secret", secret);
  }
  return secret;
}

export function getPlanos() {
  return getConfig("planos", DEFAULT_PLANOS);
}

export function planoByKey(key) {
  return getPlanos().find((p) => p.key === key) || getPlanos()[0];
}

function emptyUserData(user) {
  return {
    perfil: {
      nome: user.nome,
      email: user.email,
      estado: "SP",
      desconto: 42,
      planoKey: "trial",
      plano: "Trial 21 dias",
      status: "ativo",
      validoAte: Date.now() + 21 * 86400000,
      indicacoes: 0,
    },
    acessos: [],
    vendas: [],
    recrutamento: [],
    metas: {},
    ganhosManuais: {},
    custos: [],
    enviosCusto: [],
    pesquisas: [],
    inventario: [],
    historicoInventario: [],
    cartelas: [],
    colaboradores: [],
    contas: [
      { id: "clf", sigla: "CLF", nome: "Liberdade Financeira", pct: 10 },
      { id: "aqb", sigla: "AQB", nome: "Aquisicao de bens", pct: 10 },
      { id: "sis", sigla: "SIS", nome: "Sistema", pct: 10 },
      { id: "nec", sigla: "NEC", nome: "Necessidades Basicas", pct: 50 },
      { id: "play", sigla: "PLAY", nome: "Diversao", pct: 10 },
      { id: "doa", sigla: "DOA", nome: "Doacao", pct: 10 },
    ],
    entradasGestao: { vendas: 0, royalties: 0, bonus: 0, outros: 0 },
    precificador: [],
    lastAcesso: null,
    lastVenda: null,
    cartelaMovs: [],
    fechamentoFlags: {},
    createdAt: Date.now(),
  };
}

export function insertUser({ nome, email, senha, role = "cliente", criadoPorAdmin = false, indicadoPor = null }) {
  const id = uid("u_");
  db.prepare(
    "INSERT INTO users (id, nome, email, senha, role, criado_por_admin, indicado_por, created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(id, nome, email, hashPassword(senha), role, criadoPorAdmin ? 1 : 0, indicadoPor, Date.now());
  const user = { id, nome, email, role, criado_por_admin: criadoPorAdmin ? 1 : 0, created_at: Date.now() };
  db.prepare("INSERT INTO user_data (user_id, json, updated_at) VALUES (?,?,?)").run(
    id,
    JSON.stringify(emptyUserData(user)),
    Date.now()
  );
  return user;
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserData(id) {
  const row = db.prepare("SELECT json FROM user_data WHERE user_id = ?").get(id);
  if (!row) return null;
  try { return JSON.parse(row.json); } catch { return null; }
}

export function setUserData(id, data) {
  db.prepare(
    "INSERT INTO user_data (user_id, json, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at"
  ).run(id, JSON.stringify(data), Date.now());
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nome: u.nome, email: u.email, role: u.role };
}

export function seed() {
  setConfig("planos", getPlanos());

  const admin = getUserByEmail("admin@evscontrol.app");
  if (!admin) {
    insertUser({ nome: "Administrador", email: "admin@evscontrol.app", senha: "admin123", role: "admin" });
  }

  if (!getConfig("clients_wiped_v1", false)) {
    const clients = db.prepare("SELECT id FROM users WHERE role != 'admin'").all();
    const delColab = db.prepare("DELETE FROM colaboradores WHERE owner_id = ?");
    const delData = db.prepare("DELETE FROM user_data WHERE user_id = ?");
    const delUser = db.prepare("DELETE FROM users WHERE id = ?");
    for (const c of clients) {
      delColab.run(c.id);
      delData.run(c.id);
      delUser.run(c.id);
    }
    db.exec("DELETE FROM licenses");
    setConfig("clients_wiped_v1", true);
  }
}
