export const PERMISSION_GROUPS = [
  {
    module: "Dashboard",
    items: [{ key: "dashboard.view", label: "Visualizar Dashboard" }],
  },
  {
    module: "Acessos",
    items: [
      { key: "access.create", label: "Registrar acesso" },
      { key: "access.view", label: "Visualizar acessos" },
      { key: "access.edit", label: "Editar acesso" },
      { key: "access.delete", label: "Excluir acesso" },
    ],
  },
  {
    module: "Vendas",
    items: [
      { key: "sales.create", label: "Registrar venda" },
      { key: "sales.view", label: "Visualizar vendas" },
      { key: "sales.edit", label: "Editar venda" },
      { key: "sales.cancel", label: "Cancelar venda" },
      { key: "sales.refund", label: "Estornar venda" },
    ],
  },
  {
    module: "Clientes",
    items: [
      { key: "customers.create", label: "Cadastrar cliente" },
      { key: "customers.view", label: "Visualizar clientes" },
      { key: "customers.edit", label: "Editar cliente" },
      { key: "customers.delete", label: "Excluir cliente" },
    ],
  },
  {
    module: "Estoque",
    items: [
      { key: "inventory.view", label: "Visualizar estoque" },
      { key: "inventory.adjust", label: "Ajustar estoque" },
      { key: "inventory.purchase", label: "Registrar inventario" },
      { key: "inventory.loss", label: "Registrar perdas" },
      { key: "inventory.edit", label: "Editar inventario" },
    ],
  },
  {
    module: "Caixa",
    items: [
      { key: "cash.view", label: "Consultar caixa" },
      { key: "cash.open", label: "Abrir caixa" },
      { key: "cash.withdraw", label: "Sangria" },
      { key: "cash.expense", label: "Despesas" },
      { key: "cash.close", label: "Fechar caixa" },
      { key: "cash.reopen", label: "Reabrir caixa" },
    ],
  },
  {
    module: "Relatorios",
    items: [
      { key: "reports.view", label: "Relatorio operacional" },
      { key: "reports.financial", label: "Financeiro" },
      { key: "reports.sales", label: "Relatorio de vendas" },
      { key: "reports.inventory", label: "Relatorio de estoque" },
    ],
  },
  {
    module: "Cartelas",
    items: [
      { key: "cards.view", label: "Visualizar cartelas" },
      { key: "cards.create", label: "Registrar cartelas" },
      { key: "cards.use", label: "Utilizar cartela" },
      { key: "cards.cancel", label: "Cancelar lancamento" },
    ],
  },
  {
    module: "Equipe",
    items: [
      { key: "team.view", label: "Visualizar equipe" },
      { key: "team.create", label: "Criar colaborador" },
      { key: "team.edit", label: "Editar colaborador" },
      { key: "team.delete", label: "Desativar colaborador" },
      { key: "team.permissions", label: "Alterar permissoes" },
    ],
  },
  {
    module: "Precos",
    items: [
      { key: "pricing.view", label: "Consultar precos" },
      { key: "pricing.edit", label: "Alterar precos" },
    ],
  },
  {
    module: "Financeiro",
    items: [
      { key: "finance.view", label: "Gestao financeira" },
      { key: "finance.edit", label: "Editar contas financeiras" },
    ],
  },
  {
    module: "Configuracoes",
    items: [
      { key: "settings.view", label: "Visualizar configuracoes" },
      { key: "settings.edit", label: "Alterar configuracoes" },
      { key: "plan.view", label: "Ver plano da conta" },
      { key: "audit.view", label: "Visualizar auditoria" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

function allTrue() {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true]));
}

function fromList(keys) {
  const out = Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false]));
  keys.forEach((k) => {
    if (k in out) out[k] = true;
  });
  return out;
}

export const PROFILE_DEFAULTS = {
  proprietario: allTrue(),
  gerente: fromList([
    "dashboard.view",
    "access.create", "access.view", "access.edit",
    "sales.create", "sales.view", "sales.edit",
    "customers.create", "customers.view", "customers.edit",
    "inventory.view", "inventory.adjust", "inventory.purchase", "inventory.edit",
    "cash.view", "cash.close",
    "reports.view", "reports.financial", "reports.sales", "reports.inventory",
    "cards.view", "cards.create", "cards.use",
    "team.view",
    "pricing.view",
    "finance.view",
    "settings.view",
  ]),
  atendente: fromList([
    "dashboard.view",
    "access.create", "access.view",
    "sales.create", "sales.view",
    "customers.create", "customers.view", "customers.edit",
    "inventory.view",
    "reports.view", "reports.sales",
    "cards.view", "cards.create", "cards.use",
    "pricing.view",
  ]),
};

export const PROFILES = [
  { key: "gerente", label: "Gerente" },
  { key: "atendente", label: "Atendente" },
];

export const SENSITIVE_PERMISSIONS = new Set([
  "access.delete",
  "sales.cancel",
  "sales.refund",
  "sales.edit",
  "inventory.adjust",
  "inventory.loss",
  "cash.reopen",
  "cash.close",
  "pricing.edit",
  "team.permissions",
  "team.delete",
]);

export function resolvePermissions(perfil, overrides = {}) {
  const key = perfil === "proprietario" ? "proprietario" : (PROFILE_DEFAULTS[perfil] ? perfil : "atendente");
  const base = { ...PROFILE_DEFAULTS[key] };
  if (key === "proprietario") return base;
  Object.entries(overrides || {}).forEach(([k, v]) => {
    if (k in base) base[k] = !!v;
  });
  return base;
}

export function can(perms, key) {
  if (!key) return true;
  if (!perms) return false;
  if (perms[key]) return true;
  return false;
}

export function isOwnerActor(actor) {
  return actor?.type === "owner" || actor?.type === "admin" || actor?.perfil === "proprietario";
}

export const COLLECTION_PERMS = {
  acessos: { add: "access.create", edit: "access.edit", remove: "access.delete", view: "access.view" },
  vendas: { add: "sales.create", edit: "sales.edit", remove: "sales.cancel", view: "sales.view" },
  recrutamento: { add: "customers.create", edit: "customers.edit", remove: "customers.delete", view: "customers.view" },
  pesquisas: { add: "customers.create", edit: "customers.edit", remove: "customers.delete", view: "customers.view" },
  inventario: { add: "inventory.adjust", edit: "inventory.adjust", remove: "inventory.adjust", view: "inventory.view" },
  historicoInventario: { add: "inventory.purchase", edit: "inventory.edit", remove: "inventory.edit", view: "inventory.view" },
  cartelas: { add: "cards.create", edit: "cards.create", remove: "cards.cancel", view: "cards.view" },
  cartelaMovs: { add: "cards.create", edit: "cards.use", remove: "cards.cancel", view: "cards.view" },
  enviosCusto: { add: "cash.close", edit: "cash.close", remove: "cash.reopen", view: "cash.view" },
  custos: { add: "cash.expense", edit: "cash.expense", remove: "cash.reopen", view: "cash.view" },
  precificador: { add: "pricing.edit", edit: "pricing.edit", remove: "pricing.edit", view: "pricing.view" },
  contas: { add: "finance.edit", edit: "finance.edit", remove: "finance.edit", view: "finance.view" },
};

export const OBJECT_PERMS = {
  metas: "dashboard.view",
  ganhosManuais: "reports.financial",
  fechamentoFlags: "cash.close",
  entradasGestao: "finance.edit",
  lastAcesso: "access.create",
  lastVenda: "sales.create",
};

export const OWNER_ONLY_PERFIL_KEYS = ["planoKey", "plano", "status", "validoAte", "indicacoes", "email", "nome"];

export const REDACT_IF_DENIED = [
  { perm: "reports.financial", keys: ["ganhosManuais"] },
  { perm: "finance.view", keys: ["contas", "entradasGestao"] },
  { perm: "cash.view", keys: ["enviosCusto", "custos", "fechamentoFlags"] },
  { perm: "inventory.view", keys: ["inventario", "historicoInventario"] },
  { perm: "cards.view", keys: ["cartelas", "cartelaMovs"] },
  { perm: "plan.view", perfilKeys: ["planoKey", "plano", "validoAte", "indicacoes"] },
  { perm: "team.view", keys: ["colaboradores"] },
];
