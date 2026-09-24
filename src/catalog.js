export const PRODUTOS = [
  { id: "shake-baunilha", nome: "Shake Proteico Baunilha 550g", pv: 23.95, preco: 189.9 },
  { id: "shake-chocolate", nome: "Shake Proteico Chocolate 550g", pv: 23.95, preco: 189.9 },
  { id: "shake-morango", nome: "Shake Proteico Morango 550g", pv: 23.95, preco: 189.9 },
  { id: "shake-cookies", nome: "Shake Proteico Cookies 550g", pv: 23.95, preco: 189.9 },
  { id: "shake-cappuccino", nome: "Shake Proteico Cappuccino 550g", pv: 23.95, preco: 189.9 },
  { id: "shake-banana", nome: "Shake Proteico Banana Caramelo 550g", pv: 23.95, preco: 189.9 },
  { id: "proteina", nome: "Proteina em Po 360g", pv: 21.75, preco: 172.5 },
  { id: "cha-original", nome: "Cha Concentrado Original 100g", pv: 18.5, preco: 146.7 },
  { id: "cha-limao", nome: "Cha Concentrado Limao 50g", pv: 10.95, preco: 86.8 },
  { id: "cha-pessego", nome: "Cha Concentrado Pessego 50g", pv: 10.95, preco: 86.8 },
  { id: "aloe-manga", nome: "Suco Aloe Manga 473ml", pv: 15.4, preco: 122.1 },
  { id: "aloe-cranberry", nome: "Suco Aloe Cranberry 473ml", pv: 15.4, preco: 122.1 },
  { id: "nrg", nome: "Bebida Energética 60g", pv: 16.75, preco: 132.8 },
  { id: "lift-off", nome: "Efervescente Laranja 10 un", pv: 14.25, preco: 112.9 },
  { id: "fiberbond", nome: "Fibra em Capsulas 90 un", pv: 19.8, preco: 156.9 },
  { id: "multivitaminico", nome: "Multivitaminico 90 un", pv: 17.6, preco: 139.5 },
  { id: "cell-activator", nome: "Ativador Celular 60 un", pv: 22.1, preco: 175.2 },
  { id: "omega", nome: "Omega 3 60 caps", pv: 24.35, preco: 192.9 },
  { id: "tri-shield", nome: "Complexo Imunidade 60 un", pv: 20.4, preco: 161.7 },
  { id: "collagen", nome: "Colageno Beauty 270g", pv: 26.8, preco: 212.4 },
  { id: "duo-saciedade", nome: "Duo Saciedade 30 saches", pv: 38.9, preco: 308.5 },
  { id: "isotonic", nome: "Isotonico 540g", pv: 21.3, preco: 168.8 },
  { id: "hydrate", nome: "Hidratacao Limao 20 saches", pv: 12.75, preco: 101.1 },
  { id: "barrinha", nome: "Barrinha Proteica 14 un", pv: 18.9, preco: 149.8 },
  { id: "soup-galinha", nome: "Sopa Proteica Galinha 554g", pv: 22.45, preco: 177.9 },
  { id: "soup-tomate", nome: "Sopa Proteica Tomate 554g", pv: 22.45, preco: 177.9 },
  { id: "overnight", nome: "Overnight Protein Chocolate 240g", pv: 19.55, preco: 154.9 },
  { id: "skin-booster", nome: "Booster de Pele 30 saches", pv: 29.7, preco: 235.4 },
  { id: "aloe-plus", nome: "Aloe Plus 120ml", pv: 13.2, preco: 104.6 },
  { id: "kit-inicio", nome: "Kit Inicio Shake + Cha + Aloe", pv: 58.4, preco: 462.8 },
];

export function custoComDesconto(preco, desconto) {
  const d = Number(desconto) || 0;
  return preco * (1 - d / 100);
}

export function buscarProdutos(termo) {
  const t = (termo || "").trim().toLowerCase();
  if (!t) return [];
  return PRODUTOS.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 8);
}
