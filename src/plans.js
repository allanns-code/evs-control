export const PLANOS = [
  { key: "trial", nome: "Trial 21 dias", preco: 0, dias: 21, desc: "Teste gratis para novos clientes" },
  { key: "mensal", nome: "Mensal", preco: 7.9, dias: 30, desc: "Acesso por 30 dias" },
  { key: "trimestral", nome: "Trimestral", preco: 19.9, dias: 90, desc: "Acesso por 90 dias" },
  { key: "semestral", nome: "Semestral", preco: 35.9, dias: 180, desc: "Acesso por 180 dias" },
  { key: "anual", nome: "Anual", preco: 69.9, dias: 365, desc: "Acesso por 365 dias" },
];

export function planoByKey(key) {
  return PLANOS.find((p) => p.key === key) || PLANOS[0];
}

export function planoLabel(key) {
  return planoByKey(key).nome;
}

export function monthlyValue(preco, dias) {
  const d = Number(dias) || 30;
  return (Number(preco) || 0) / (d / 30);
}
