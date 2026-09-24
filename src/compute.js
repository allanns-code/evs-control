import { MESES, averageDaily, projectMonth } from "./utils.js";

export function filterPeriod(list, ano, mes, dia = null) {
  return (list || []).filter((x) => {
    const sameYear = Number(x.ano) === Number(ano);
    const sameMonth = Number(x.mes) === Number(mes) || x.mes === MESES[mes];
    const sameDay = dia == null || Number(x.dia) === Number(dia);
    return sameYear && sameMonth && sameDay;
  });
}

export function monthStats(data, ano, mes) {
  const acessos = filterPeriod(data.acessos, ano, mes);
  const vendas = filterPeriod(data.vendas, ano, mes);
  const rec = filterPeriod(data.recrutamento, ano, mes);
  const fatAcessos = acessos.reduce((s, a) => s + Number(a.valor), 0);
  const fatVendas = vendas.reduce((s, v) => s + Number(v.valor), 0);
  const custoVendas = vendas.reduce((s, v) => s + Number(v.custo), 0);
  const lucroAcessos = fatAcessos;
  const lucroVendas = fatVendas - custoVendas;
  const faturamento = fatAcessos + fatVendas;
  const lucro = lucroAcessos + lucroVendas;
  return {
    acessos,
    vendas,
    rec,
    fatAcessos,
    fatVendas,
    custoVendas,
    faturamento,
    lucro,
    lucroAcessos,
    lucroVendas,
    totalAcessos: acessos.length,
    dist: rec.filter((r) => r.tipo === "D").length,
    sup: rec.filter((r) => r.tipo === "S").length,
    ticket: acessos.length ? fatAcessos / acessos.length : 0,
    mediaAcessos: averageDaily(acessos.length, ano, mes),
    projFat: projectMonth(faturamento, ano, mes),
    projLucro: projectMonth(lucro, ano, mes),
  };
}

export function dayStats(data, ano, mes, dia) {
  const acessos = filterPeriod(data.acessos, ano, mes, dia);
  const vendas = filterPeriod(data.vendas, ano, mes, dia);
  const entrada = acessos.reduce((s, a) => s + Number(a.valor), 0) + vendas.reduce((s, v) => s + Number(v.valor), 0);
  const custo = vendas.reduce((s, v) => s + Number(v.custo), 0);
  return {
    acessos,
    vendas,
    entrada,
    custo,
    lucro: entrada - custo,
    nAcessos: acessos.length,
    nVendas: vendas.length,
  };
}

export function yearStats(data, ano) {
  return MESES.map((_, mes) => {
    const m = monthStats(data, ano, mes);
    const man = data.ganhosManuais?.[`${ano}-${mes}`] || { royalties: 0, bonus: 0, pv: 0 };
    return {
      mes,
      nome: MESES[mes],
      lucroEvs: m.lucroAcessos,
      lucroVendas: m.lucroVendas,
      royalties: Number(man.royalties) || 0,
      bonus: Number(man.bonus) || 0,
      pv: Number(man.pv) || 0,
      total: m.lucroAcessos + m.lucroVendas + (Number(man.royalties) || 0) + (Number(man.bonus) || 0),
    };
  });
}
