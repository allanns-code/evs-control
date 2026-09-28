import { store } from "../store.js";
import { navigate } from "../router.js";
import {
  MESES, ESTADOS, DESCONTOS, formatMoney, todayParts,
  toast, confirmModal, escapeHtml, uid,
} from "../utils.js";
import { monthStats, dayStats, yearStats } from "../compute.js";
import { PRODUTOS, custoComDesconto, produtoPorId, produtoPorNome } from "../catalog.js";

function guard() {
  if (!store.currentUser()) { navigate("/login"); return false; }
  return true;
}

function pageShell(title, sub, body, extra = "") {
  return `
    <div class="container">
      <div class="page-head">
        <h1>${title}</h1>
        ${sub ? `<p>${sub}</p>` : ""}
        <a class="back" href="#/">Voltar para o painel</a>
      </div>
      ${extra}${body}
    </div>`;
}

export function renderPesquisa(root) {
  if (!guard()) return;
  root.innerHTML = pageShell("Pesquisa do Bem Estar", "Espaco Vida Saudavel", `
    <div class="card">
      <form id="formPesq">
        <label class="field">Nome do prospecto</label>
        <input name="nome" required />
        <label class="field">WhatsApp ou contato</label>
        <input name="contato" required />
        <label class="field">Cidade</label>
        <input name="cidade" required />
        <label class="field">1 - Voce se preocupa com sua saude?</label>
        <div class="radio-row">
          <label><input type="radio" name="saude" value="Sim" required> Sim</label>
          <label><input type="radio" name="saude" value="Nao"> Nao</label>
        </div>
        <label class="field">2 - Seu nivel de energia durante o dia e:</label>
        <div class="radio-row">
          <label><input type="radio" name="energia" value="Bom" required> Bom</label>
          <label><input type="radio" name="energia" value="Medio"> Medio</label>
          <label><input type="radio" name="energia" value="Ruim"> Ruim</label>
        </div>
        <label class="field">3 - Voce esta satisfeito com seu peso atual?</label>
        <div class="radio-row">
          <label><input type="radio" name="peso" value="Sim" required> Sim</label>
          <label><input type="radio" name="peso" value="Nao"> Nao</label>
        </div>
        <label class="field">4 - Qual seria seu objetivo hoje?</label>
        <div class="radio-row">
          <label><input type="radio" name="objetivo" value="Perder peso" required> Perder peso</label>
          <label><input type="radio" name="objetivo" value="Ganhar peso"> Ganhar peso</label>
          <label><input type="radio" name="objetivo" value="Manter o peso"> Manter o peso</label>
        </div>
        <button>Salvar Pesquisa</button>
        <button type="reset" class="btn-ghost">Nova Pesquisa</button>
        <button type="button" class="btn-outline" id="btnRel">Abrir Relatorio</button>
      </form>
    </div>
    <div class="card" style="background:#fff8e8">
      <strong>Lembrete</strong>
      <p class="muted">Por ter respondido esta pesquisa, voce acaba de ganhar um brinde do Espaco Vida Saudavel.</p>
    </div>
    <div class="modal" id="modalRel">
      <div class="modal-content" style="max-width:96%">
        <div class="close" id="closeRel">X</div>
        <h3>Relatorio de Contatos</h3>
        <input id="filtroPesq" placeholder="Pesquisar nome, contato ou cidade" />
        <div class="kpi" style="margin-bottom:10px">
          <div class="card"><span>Total</span><strong id="kTotal">0</strong></div>
          <div class="card"><span>Hoje</span><strong id="kHoje">0</strong></div>
        </div>
        <button type="button" id="btnCsv" class="btn-ghost">Exportar CSV</button>
        <div style="overflow:auto"><table class="table" id="tblPesq"></table></div>
      </div>
    </div>
  `);

  root.querySelector("#formPesq").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.addPesquisa({
      nome: fd.get("nome"),
      contato: fd.get("contato"),
      cidade: fd.get("cidade"),
      saude: fd.get("saude"),
      energia: fd.get("energia"),
      peso: fd.get("peso"),
      objetivo: fd.get("objetivo"),
    });
    toast("Pesquisa salva");
    e.target.reset();
  };

  const modal = root.querySelector("#modalRel");
  function drawTable(filtro = "") {
    const list = (store.data().pesquisas || []).filter((p) => {
      const t = filtro.toLowerCase();
      return !t || [p.nome, p.contato, p.cidade].join(" ").toLowerCase().includes(t);
    });
    const hoje = new Date().toDateString();
    root.querySelector("#kTotal").textContent = (store.data().pesquisas || []).length;
    root.querySelector("#kHoje").textContent = (store.data().pesquisas || []).filter((p) => new Date(p.ts).toDateString() === hoje).length;
    root.querySelector("#tblPesq").innerHTML = `
      <thead><tr><th>Data</th><th>Nome</th><th>Contato</th><th>Cidade</th><th>Saude</th><th>Energia</th><th>Peso</th><th>Objetivo</th></tr></thead>
      <tbody>${list.map((p)=>`<tr>
        <td>${new Date(p.ts).toLocaleString("pt-BR")}</td>
        <td>${escapeHtml(p.nome)}</td><td>${escapeHtml(p.contato)}</td><td>${escapeHtml(p.cidade)}</td>
        <td>${p.saude}</td><td>${p.energia}</td><td>${p.peso}</td><td>${p.objetivo}</td>
      </tr>`).join("") || `<tr><td colspan="8">Nenhuma pesquisa</td></tr>`}</tbody>`;
  }
  root.querySelector("#btnRel").onclick = () => { drawTable(); modal.classList.add("show"); };
  root.querySelector("#closeRel").onclick = () => modal.classList.remove("show");
  root.querySelector("#filtroPesq").oninput = (e) => drawTable(e.target.value);
  root.querySelector("#btnCsv").onclick = () => {
    const rows = store.data().pesquisas || [];
    const csv = ["Data,Nome,Contato,Cidade,Saude,Energia,Peso,Objetivo"]
      .concat(rows.map((p) => [new Date(p.ts).toLocaleString("pt-BR"), p.nome, p.contato, p.cidade, p.saude, p.energia, p.peso, p.objetivo].join(",")))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "pesquisas.csv";
    a.click();
  };
}

export function renderPrecos(root) {
  if (!guard()) return;
  const perfil = store.data().perfil;
  root.innerHTML = pageShell("Tabela de Precos", "Consulte PV, cliente e distribuidor", `
    <div class="card">
      <div style="display:flex;gap:8px">
        <select id="est">${ESTADOS.map((e)=>`<option ${perfil.estado===e?"selected":""}>${e}</option>`).join("")}</select>
        <select id="desc">${DESCONTOS.map((d)=>`<option value="${d}" ${Number(perfil.desconto)===d?"selected":""}>${d}%</option>`).join("")}</select>
      </div>
      <input id="busca" placeholder="Pesquisar produto" />
      <div style="overflow:auto">
        <table class="table"><thead><tr><th>Produto</th><th>PV</th><th>Cliente</th><th>Distribuidor</th></tr></thead><tbody id="tbody"></tbody></table>
      </div>
      <button type="button" id="btnShare" class="btn-ghost">Compartilhar tabela</button>
    </div>
  `);
  function draw() {
    const t = root.querySelector("#busca").value.toLowerCase();
    const desc = Number(root.querySelector("#desc").value);
    const estado = root.querySelector("#est").value;
    const list = PRODUTOS.filter((p) =>
      p.nome.toLowerCase().includes(t) || (p.detalhe || "").toLowerCase().includes(t)
    );
    root.querySelector("#tbody").innerHTML = list.map((p) => `
      <tr>
        <td>${escapeHtml(p.nome)}${p.detalhe ? `<br><small class="muted">${escapeHtml(p.detalhe)}</small>` : ""}</td>
        <td>${Number(p.pv).toFixed(2)}</td>
        <td>${formatMoney(p.preco)}</td>
        <td>${formatMoney(custoComDesconto(p.preco, desc, p, estado))}</td>
      </tr>`).join("");
  }
  root.querySelector("#busca").oninput = draw;
  root.querySelector("#desc").onchange = (e) => { store.setPerfil({ desconto: Number(e.target.value) }); draw(); };
  root.querySelector("#est").onchange = (e) => { store.setPerfil({ estado: e.target.value }); draw(); };
  root.querySelector("#btnShare").onclick = async () => {
    const text = `Tabela de precos EVS Control\n${location.origin}${location.pathname}#/precos`;
    await navigator.clipboard.writeText(text);
    toast("Mensagem copiada! Cole no WhatsApp.");
  };
  draw();
}

export function renderFechamento(root) {
  if (!guard()) return;
  const t = todayParts();
  let ano = t.ano, mes = t.mes, dia = t.dia;
  const lixoSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  root.innerHTML = pageShell("Controle de Custos", `<span id="fechSub">Dia ${dia} · ${MESES[mes]} · ${ano}</span>`, `
    <div class="filtros fech-filtros">
      <select id="ano"></select>
      <select id="mes">${MESES.map((m,i)=>`<option value="${i}" ${i===mes?"selected":""}>${m}</option>`).join("")}</select>
      <select id="dia"></select>
    </div>
    <div class="card">
      <div class="fech-row">
        <span class="fech-label">Custo do dia:</span>
        <strong id="custoDia">R$ 0,00</strong>
      </div>
      <label class="fech-check">
        <input type="checkbox" id="mais10" checked>
        <span>Soma <strong>+ 10% do lucro</strong> ao custo do dia</span>
      </label>
      <div class="fech-row fech-hint-row">
        <span class="fech-hint">Ou desmarque se nao quiser acrescentar.</span>
        <strong id="custoAjustado">R$ 0,00</strong>
      </div>
    </div>
    <div class="card">
      <div class="fech-label" style="margin-bottom:8px">Valor enviado para conta de produtos</div>
      <div class="envio-prefix">
        <span>R$</span>
        <input id="valorEnvio" type="number" step="0.01" min="0" placeholder="0,00" />
      </div>
      <button id="btnEnvio">Registrar envio - conta de custo</button>
      <div class="fech-split">
        <div>
          <div class="fech-mini">Total enviado.</div>
          <strong id="totalEnvio">R$ 0,00</strong>
        </div>
        <div>
          <div class="fech-mini">Falta enviar valor de custo do dia.</div>
          <strong id="faltaDia" class="fech-falta">R$ 0,00</strong>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="fech-label" style="margin-bottom:6px">Envios feito</div>
      <div id="listaEnvios"></div>
    </div>
    <div class="card">
      <div class="fech-split">
        <div>
          <div class="fech-mini">Total de custos do mes para recompra.</div>
          <strong id="custoMes">R$ 0,00</strong>
        </div>
        <div>
          <div class="fech-mini">Falta enviar para conta de custo acumulados do mes.</div>
          <strong id="faltaMes" class="fech-falta">R$ 0,00</strong>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="fech-label" style="margin-bottom:8px">Dias com transferencia pendente</div>
      <div id="pendentes"></div>
    </div>
  `);
  const anos = [];
  for (let a = t.ano - 3; a <= t.ano + 1; a++) anos.push(a);
  root.querySelector("#ano").innerHTML = anos.map((a)=>`<option ${a===ano?"selected":""}>${a}</option>`).join("");
  function fillDays() {
    const n = new Date(ano, mes + 1, 0).getDate();
    if (dia > n) dia = n;
    root.querySelector("#dia").innerHTML = Array.from({length:n},(_,i)=>`<option value="${i+1}" ${i+1===dia?"selected":""}>Dia ${i+1}</option>`).join("");
  }
  fillDays();
  function custoAjustadoDia(ds, plus) {
    return ds.custo + (plus ? ds.lucro * 0.1 : 0);
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function setFalta(el, valor) {
    el.textContent = formatMoney(valor);
    el.classList.toggle("is-pendente", valor > 0);
  }
  function refresh() {
    root.querySelector("#fechSub").textContent = `Dia ${dia} · ${MESES[mes]} · ${ano}`;
    const data = store.data();
    const d = dayStats(data, ano, mes, dia);
    const plus = store.getFechamentoFlag(ano, mes, dia);
    root.querySelector("#mais10").checked = plus;
    const custoDia = custoAjustadoDia(d, plus);
    const enviosDia = (data.enviosCusto || []).filter((e) => Number(e.ano)===ano && Number(e.mes)===mes && Number(e.dia)===dia);
    const enviosMes = (data.enviosCusto || []).filter((e) => Number(e.ano)===ano && Number(e.mes)===mes);
    const totDia = enviosDia.reduce((s,e)=>s+Number(e.valor),0);
    const totMes = enviosMes.reduce((s,e)=>s+Number(e.valor),0);
    const diasMes = new Date(ano, mes+1, 0).getDate();
    let custoMesBase = 0;
    let custoMesAjustado = 0;
    const pend = [];
    for (let i=1;i<=diasMes;i++) {
      const ds = dayStats(data, ano, mes, i);
      const fl = store.getFechamentoFlag(ano, mes, i);
      const ca = custoAjustadoDia(ds, fl);
      custoMesBase += ds.custo;
      custoMesAjustado += ca;
      if (ca <= 0) continue;
      const env = (data.enviosCusto||[]).filter((e)=>Number(e.dia)===i && Number(e.mes)===mes && Number(e.ano)===ano).reduce((s,e)=>s+Number(e.valor),0);
      const falta = ca - env;
      if (falta > 0.009) {
        pend.push({ i, fl, falta });
      }
    }
    const faltaDia = Math.max(0, custoDia - totDia);
    const faltaMes = Math.max(0, custoMesAjustado - totMes);
    root.querySelector("#custoDia").textContent = formatMoney(d.custo);
    root.querySelector("#custoAjustado").textContent = formatMoney(custoDia);
    root.querySelector("#totalEnvio").textContent = formatMoney(totDia);
    setFalta(root.querySelector("#faltaDia"), faltaDia);
    root.querySelector("#custoMes").textContent = formatMoney(custoMesBase);
    setFalta(root.querySelector("#faltaMes"), faltaMes);
    root.querySelector("#listaEnvios").innerHTML = enviosDia.length
      ? enviosDia.map((e)=>`<div class="envio-item">
          <strong>${formatMoney(e.valor)}</strong>
          <button type="button" class="btn-lixo" data-envio="${e.id}" aria-label="Excluir envio">${lixoSvg}</button>
        </div>`).join("")
      : `<p class="muted">Nenhum envio neste dia.</p>`;
    root.querySelector("#pendentes").innerHTML = pend.length
      ? pend.map((p)=>`<div class="pend-item">
          <div class="pend-dia">${pad(p.i)}/${pad(mes+1)}/${ano}${p.fl ? " · +10% aplicado" : ""}</div>
          <div class="pend-falta">Falta enviar: ${formatMoney(p.falta)}</div>
        </div>`).join("")
      : `<p class="muted">Nenhum dia pendente.</p>`;
    root.querySelectorAll("[data-envio]").forEach((b) => {
      b.onclick = async () => {
        if (await confirmModal("Deseja excluir este envio?")) {
          store.removeById("enviosCusto", b.dataset.envio);
          toast("Envio excluido");
          refresh();
        }
      };
    });
  }
  root.querySelector("#ano").onchange = (e) => { ano = Number(e.target.value); fillDays(); refresh(); };
  root.querySelector("#mes").onchange = (e) => { mes = Number(e.target.value); fillDays(); refresh(); };
  root.querySelector("#dia").onchange = (e) => { dia = Number(e.target.value); refresh(); };
  root.querySelector("#mais10").onchange = () => {
    store.setFechamentoFlag(ano, mes, dia, root.querySelector("#mais10").checked);
    refresh();
  };
  root.querySelector("#btnEnvio").onclick = () => {
    const valor = Number(root.querySelector("#valorEnvio").value);
    if (!valor || valor <= 0) { toast("Informe o valor", "err"); return; }
    store.addEnvioCusto({ dia, mes, ano, valor });
    root.querySelector("#valorEnvio").value = "";
    toast("Envio registrado");
    refresh();
  };
  refresh();
}

export function renderResumo(root) {
  if (!guard()) return;
  const t = todayParts();
  let ano = t.ano;
  root.innerHTML = pageShell("Resumo de Ganhos", "Lucros, royalties, bonus e PV", `
    <div class="card muted">Preenchimento manual: informe royalties, bonus e PV. Lucros de acessos e vendas sao calculados automaticamente.</div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <select id="ano">${[t.ano-1,t.ano,t.ano+1].map((a)=>`<option ${a===ano?"selected":""}>${a}</option>`).join("")}</select>
      <button id="btnUpd" class="btn-ghost" style="margin:0">Atualizar</button>
    </div>
    <div class="kpi">
      <div class="card">Lucro dos Acessos<strong id="kA">R$ 0,00</strong></div>
      <div class="card">Lucro das Vendas<strong id="kV">R$ 0,00</strong></div>
      <div class="card">Ganhos Totais do Ano<strong id="kT">R$ 0,00</strong></div>
      <div class="card">PV Total do Ano<strong id="kP">0,00 PV</strong></div>
    </div>
    <div class="card" style="overflow:auto;margin-top:12px">
      <table class="table" id="tbl"></table>
    </div>
  `);
  function draw() {
    const data = store.data();
    const rows = yearStats(data, ano);
    const kA = rows.reduce((s,r)=>s+r.lucroEvs,0);
    const kV = rows.reduce((s,r)=>s+r.lucroVendas,0);
    const kT = rows.reduce((s,r)=>s+r.total,0);
    const kP = rows.reduce((s,r)=>s+r.pv,0);
    root.querySelector("#kA").textContent = formatMoney(kA);
    root.querySelector("#kV").textContent = formatMoney(kV);
    root.querySelector("#kT").textContent = formatMoney(kT);
    root.querySelector("#kP").textContent = `${kP.toFixed(2)} PV`;
    root.querySelector("#tbl").innerHTML = `
      <thead><tr><th>Mes</th><th>Lucro EVS</th><th>Lucro Vendas</th><th>Royalties</th><th>Bonus</th><th>PV</th><th>Total</th></tr></thead>
      <tbody>${rows.map((r)=>`<tr>
        <td>${r.nome}</td>
        <td>${formatMoney(r.lucroEvs)}</td>
        <td>${formatMoney(r.lucroVendas)}</td>
        <td><input data-f="royalties" data-m="${r.mes}" value="${r.royalties||""}" style="margin:0;padding:6px"></td>
        <td><input data-f="bonus" data-m="${r.mes}" value="${r.bonus||""}" style="margin:0;padding:6px"></td>
        <td><input data-f="pv" data-m="${r.mes}" value="${r.pv||""}" style="margin:0;padding:6px"></td>
        <td><strong>${formatMoney(r.total)}</strong></td>
      </tr>`).join("")}</tbody>`;
    root.querySelectorAll("input[data-f]").forEach((inp) => {
      inp.onchange = () => {
        store.setGanhoManual(ano, Number(inp.dataset.m), inp.dataset.f, inp.value);
        draw();
      };
    });
  }
  root.querySelector("#ano").onchange = (e) => { ano = Number(e.target.value); draw(); };
  root.querySelector("#btnUpd").onclick = draw;
  draw();
}

export function renderGestao(root) {
  if (!guard()) return;
  const data = store.data();
  root.innerHTML = pageShell("Gestao Financeira", "Distribua seus ganhos por contas", `
    <div class="card">
      <div class="gestao-row" style="font-weight:700;color:#2B4ECC">
        <div>SIGLA</div><div>CONTA</div><div>%</div><div>VALOR</div>
      </div>
      <div id="linhas"></div>
      <p>Total: <strong id="totPct">100%</strong></p>
      <div class="row-actions">
        <button type="button" id="addConta" class="btn-ghost">+ Adicionar conta</button>
        <button type="button" id="reset" class="btn-outline">Restaurar Padrao</button>
      </div>
    </div>
    <div class="card">
      <label class="field">VENDAS</label>
      <input id="gVendas" type="number" step="0.01" value="${data.entradasGestao.vendas||""}" />
      <label class="field">ROYALTIES</label>
      <input id="gRoy" type="number" step="0.01" value="${data.entradasGestao.royalties||""}" />
      <label class="field">BONUS</label>
      <input id="gBon" type="number" step="0.01" value="${data.entradasGestao.bonus||""}" />
      <label class="field">OUTROS</label>
      <input id="gOut" type="number" step="0.01" value="${data.entradasGestao.outros||""}" />
      <p><strong>TOTAL GERAL: <span id="totGeral">R$ 0,00</span></strong></p>
    </div>
  `);
  function totalEntradas() {
    return ["gVendas","gRoy","gBon","gOut"].reduce((s,id)=>s+Number(root.querySelector("#"+id).value||0),0);
  }
  function draw() {
    const contas = store.data().contas;
    const total = totalEntradas();
    const pct = contas.reduce((s,c)=>s+Number(c.pct||0),0);
    root.querySelector("#totPct").textContent = `${pct}%`;
    root.querySelector("#totPct").style.color = pct === 100 ? "#2B4ECC" : "#c62828";
    root.querySelector("#totGeral").textContent = formatMoney(total);
    root.querySelector("#linhas").innerHTML = contas.map((c,i)=>`
      <div class="gestao-row">
        <input data-i="${i}" data-k="sigla" value="${escapeHtml(c.sigla)}" />
        <input data-i="${i}" data-k="nome" value="${escapeHtml(c.nome)}" />
        <input data-i="${i}" data-k="pct" type="number" value="${c.pct}" />
        <strong>${formatMoney(total * (Number(c.pct)||0) / 100)}</strong>
      </div>`).join("");
    root.querySelectorAll("#linhas input").forEach((inp) => {
      inp.onchange = () => {
        const contas2 = store.data().contas.map((c)=>({...c}));
        const k = inp.dataset.k;
        contas2[Number(inp.dataset.i)][k] = k === "pct" ? Number(inp.value) : inp.value;
        store.setContas(contas2);
        draw();
      };
    });
  }
  ["gVendas","gRoy","gBon","gOut"].forEach((id) => {
    root.querySelector("#"+id).oninput = () => {
      store.setEntradasGestao({
        vendas: Number(root.querySelector("#gVendas").value)||0,
        royalties: Number(root.querySelector("#gRoy").value)||0,
        bonus: Number(root.querySelector("#gBon").value)||0,
        outros: Number(root.querySelector("#gOut").value)||0,
      });
      draw();
    };
  });
  root.querySelector("#addConta").onclick = () => {
    const contas = store.data().contas.concat([{ id: uid(), sigla: "NOVA", nome: "Nova conta", pct: 0 }]);
    store.setContas(contas);
    draw();
  };
  root.querySelector("#reset").onclick = () => { store.resetContas(); draw(); };
  draw();
}

export function renderPrecificador(root) {
  if (!guard()) return;
  let rows = (store.data().precificador || []).map((r)=>({...r}));
  if (!rows.length) rows = [{ id: uid(), produto: "", custo: 0, pv: 0, porcoes: 1 }];
  root.innerHTML = pageShell("Precificador", "Produtos preparados (EVS porcoes)", `
    <div class="card">
      <div class="row-actions" style="margin-bottom:10px">
        <button type="button" id="limpar" class="btn-ghost">Limpar Tudo</button>
        <button type="button" id="salvar">Salvar</button>
      </div>
      <div id="lista"></div>
      <button type="button" id="add" class="btn-outline">+ Adicionar item</button>
      <p class="muted">Digite o Custo Total, PV Total e a quantidade de Porcoes. O sistema calcula automaticamente.</p>
    </div>
    <div class="card">
      <h3>Resumo Geral</h3>
      <p>Total Custo / Porcao <strong id="rCusto">R$ 0,00</strong></p>
      <p>Total PV / Porcao <strong id="rPv">0,00</strong></p>
      <p>Valor Sugerido de Venda <strong id="rVenda">R$ 0,00</strong></p>
      <p>Lucro <strong id="rLucro">R$ 0,00</strong></p>
      <p class="muted">Regra: custo = 60% · Lucro = venda - custo</p>
    </div>
  `);
  function updateResumo() {
    const custoPor = rows.reduce((s,r)=>s+(Number(r.custo)||0)/(Number(r.porcoes)||1),0);
    const pvPor = rows.reduce((s,r)=>s+(Number(r.pv)||0)/(Number(r.porcoes)||1),0);
    const venda = custoPor / 0.6;
    root.querySelector("#rCusto").textContent = formatMoney(custoPor);
    root.querySelector("#rPv").textContent = pvPor.toFixed(2);
    root.querySelector("#rVenda").textContent = formatMoney(venda);
    root.querySelector("#rLucro").textContent = formatMoney(venda - custoPor);
  }
  function draw() {
    root.querySelector("#lista").innerHTML = rows.map((r,i)=>`
      <div class="card" style="margin:0 0 8px;padding:10px">
        <input data-i="${i}" data-k="produto" placeholder="Produto" value="${escapeHtml(r.produto)}" />
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
          <input data-i="${i}" data-k="custo" type="number" step="0.01" placeholder="Custo" value="${r.custo||""}" />
          <input data-i="${i}" data-k="pv" type="number" step="0.01" placeholder="PV" value="${r.pv||""}" />
          <input data-i="${i}" data-k="porcoes" type="number" placeholder="Porcoes" value="${r.porcoes||1}" />
        </div>
        <p class="muted line-calc">Custo/porcao ${formatMoney((r.custo||0)/(r.porcoes||1))} · PV/porcao ${((r.pv||0)/(r.porcoes||1)).toFixed(2)}</p>
        <button type="button" class="btn-ghost small-btn" data-del="${i}">Remover</button>
      </div>`).join("");
    updateResumo();
    root.querySelectorAll("#lista input").forEach((inp) => {
      inp.oninput = () => {
        const i = Number(inp.dataset.i);
        const k = inp.dataset.k;
        rows[i][k] = k === "produto" ? inp.value : Number(inp.value);
        const r = rows[i];
        const line = inp.closest(".card").querySelector(".line-calc");
        if (line) line.textContent = `Custo/porcao ${formatMoney((r.custo||0)/(r.porcoes||1))} · PV/porcao ${((r.pv||0)/(r.porcoes||1)).toFixed(2)}`;
        updateResumo();
      };
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { rows.splice(+b.dataset.del,1); draw(); });
  }
  root.querySelector("#add").onclick = () => { rows.push({ id: uid(), produto: "", custo: 0, pv: 0, porcoes: 1 }); draw(); };
  root.querySelector("#limpar").onclick = () => { rows = [{ id: uid(), produto: "", custo: 0, pv: 0, porcoes: 1 }]; draw(); };
  root.querySelector("#salvar").onclick = () => { store.setPrecificador(rows); toast("Precificador salvo"); };
  draw();
}

export function renderInventario(root) {
  if (!guard()) return;
  const data = store.data();
  const perfil = data.perfil;
  const saved = (data.inventario || []).map((r) => {
    const cat = produtoPorId(r.id) || produtoPorNome(r.nome);
    return {
      ...r,
      id: cat?.id || r.id,
      nome: cat?.nome || r.nome,
      preco: cat?.preco ?? r.preco,
      pv: cat?.pv ?? r.pv,
    };
  });
  const seen = new Set(saved.map((r) => r.id));
  let rows = saved.concat(
    PRODUTOS.filter((p) => !seen.has(p.id)).map((p) => ({
      id: p.id, nome: p.nome, fechado: 0, aberto: 0, preco: p.preco, pv: p.pv,
    }))
  );
  root.innerHTML = pageShell("Inventario", `${perfil.estado} · Desc ${perfil.desconto}%`, `
    <div class="card" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Produto</th><th>Fechado</th><th>Aberto</th><th>Preco</th><th>PV</th><th>Total PV</th><th>Total</th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
    <div class="card">
      <p>Total estoque <strong id="totR">R$ 0,00</strong></p>
      <p>PV total <strong id="totP">0,00</strong></p>
      <div class="row-actions">
        <button type="button" id="reg">Registrar</button>
        <button type="button" id="zerar" class="btn-ghost">Zerar</button>
      </div>
    </div>
    <div class="card">
      <h3>Historico de Inventarios</h3>
      <label class="field">Valor separado (custo) - Para recompra</label>
      <input id="recompra" type="number" step="0.01" />
      <label class="field">Pedidos feitos aguardando chegar</label>
      <input id="pedidos" type="number" step="0.01" />
      <label class="field">Cartao de credito (valor total devido)</label>
      <input id="cartao" type="number" step="0.01" />
      <p>Saldo do Inventario <strong id="saldo">R$ 0,00</strong></p>
      <div id="hist"></div>
    </div>
  `);
  function custoItem(r) {
    const cat = produtoPorId(r.id) || produtoPorNome(r.nome);
    return custoComDesconto(r.preco, perfil.desconto, cat, perfil.estado);
  }
  function totals() {
    let totR = 0, totP = 0;
    rows.forEach((r) => {
      const q = (Number(r.fechado)||0) + (Number(r.aberto)||0);
      totR += q * custoItem(r);
      totP += q * (Number(r.pv) || 0);
    });
    return { totR, totP };
  }
  function draw() {
    const { totR, totP } = totals();
    root.querySelector("#tbody").innerHTML = rows.map((r,i)=>{
      const q = (Number(r.fechado)||0)+(Number(r.aberto)||0);
      const custo = custoItem(r);
      return `<tr>
        <td>${escapeHtml(r.nome)}</td>
        <td><input data-i="${i}" data-k="fechado" type="number" value="${r.fechado||0}" style="margin:0;padding:6px;width:64px"></td>
        <td><input data-i="${i}" data-k="aberto" type="number" value="${r.aberto||0}" style="margin:0;padding:6px;width:64px"></td>
        <td>${formatMoney(custo)}</td>
        <td>${Number(r.pv).toFixed(2)}</td>
        <td>${(q*r.pv).toFixed(2)}</td>
        <td>${formatMoney(q*custo)}</td>
      </tr>`;
    }).join("");
    root.querySelector("#totR").textContent = formatMoney(totR);
    root.querySelector("#totP").textContent = totP.toFixed(2);
    const rec = Number(root.querySelector("#recompra").value)||0;
    const ped = Number(root.querySelector("#pedidos").value)||0;
    const car = Number(root.querySelector("#cartao").value)||0;
    root.querySelector("#saldo").textContent = formatMoney(totR + ped - rec - car);
    root.querySelectorAll("#tbody input").forEach((inp) => {
      inp.onchange = () => { rows[Number(inp.dataset.i)][inp.dataset.k] = Number(inp.value)||0; store.setInventario(rows); draw(); };
    });
    const hist = store.data().historicoInventario || [];
    root.querySelector("#hist").innerHTML = hist.map((h)=>`
      <div class="relatorio-item">
        <div>${new Date(h.ts).toLocaleString("pt-BR")}<br>Estoque ${formatMoney(h.estoque)} · PV ${Number(h.pv).toFixed(2)} · Saldo ${formatMoney(h.saldo)}</div>
      </div>`).join("") || `<p class="muted">Nenhum historico.</p>`;
  }
  ["recompra","pedidos","cartao"].forEach((id)=> root.querySelector("#"+id).oninput = draw);
  root.querySelector("#reg").onclick = () => {
    const { totR, totP } = totals();
    const rec = Number(root.querySelector("#recompra").value)||0;
    const ped = Number(root.querySelector("#pedidos").value)||0;
    const car = Number(root.querySelector("#cartao").value)||0;
    store.setInventario(rows);
    store.addHistoricoInventario({ estoque: totR, pv: totP, recompra: rec, pedidos: ped, cartao: car, saldo: totR + ped - rec - car });
    toast("Inventario registrado");
    draw();
  };
  root.querySelector("#zerar").onclick = async () => {
    if (!await confirmModal("Zerar todas as quantidades?")) return;
    rows = rows.map((r)=>({...r, fechado:0, aberto:0}));
    store.setInventario(rows);
    draw();
  };
  draw();
}

export function renderColaboradores(root) {
  if (!guard()) return;
  root.innerHTML = pageShell("Gestao de colaboradores", store.currentUser().nome, `
    <div class="card">
      <h3>Criar colaborador</h3>
      <form id="form">
        <input name="nome" placeholder="Nome do colaborador" required />
        <input name="email" type="email" placeholder="E-mail" required />
        <input name="senha" type="password" placeholder="Senha" required />
        <button>Criar Colaborador</button>
      </form>
    </div>
    <div class="card">
      <h3>Meus colaboradores</h3>
      <button type="button" id="upd" class="btn-ghost">Atualizar lista</button>
      <div id="lista"></div>
    </div>
  `);
  function draw() {
    const list = store.data().colaboradores || [];
    root.querySelector("#lista").innerHTML = list.map((c)=>`
      <div class="relatorio-item">
        <div><strong>${escapeHtml(c.nome)}</strong><br>${escapeHtml(c.email)}</div>
        <button class="btn-apagar" data-id="${c.id}">Apagar</button>
      </div>`).join("") || `<p class="muted">Nenhum colaborador.</p>`;
    root.querySelectorAll("[data-id]").forEach((b) => b.onclick = async () => {
      if (await confirmModal("Remover colaborador?")) {
        await store.removeColaborador(b.dataset.id);
        draw();
      }
    });
  }
  root.querySelector("#form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await store.addColaborador({ nome: fd.get("nome"), email: fd.get("email"), senha: fd.get("senha") });
      toast("Colaborador criado");
      e.target.reset();
      draw();
    } catch (err) { toast(err.message, "err"); }
  };
  root.querySelector("#upd").onclick = draw;
  draw();
}

export function renderCartelas(root) {
  if (!guard()) return;
  root.innerHTML = pageShell("Cartelas antecipadas", "Controle o saldo de cartelas por cliente", `
    <div class="card" style="background:#fff8e8">
      <p><strong>Como usar</strong></p>
      <p class="muted">No dia do pagamento, lance o valor total da cartela em Acessos. Para cada uso, lance o nome do cliente com valor 0,00. O saldo desconta so quando o valor e 0,00.</p>
    </div>
    <div class="card">
      <form id="form">
        <input name="cliente" placeholder="Nome do cliente" required autocomplete="off" />
        <input name="qtd" type="number" min="1" placeholder="Quantidade de acessos adquiridos" required />
        <button>Adicionar cartelas</button>
      </form>
    </div>
    <div class="card">
      <input id="buscaCartela" placeholder="Pesquisar cliente" />
      <div id="lista"></div>
    </div>
    <div class="modal" id="modalCartela">
      <div class="modal-content">
        <div class="close" id="closeCartela">X</div>
        <div id="detalheCartela"></div>
      </div>
    </div>
  `);
  const modal = root.querySelector("#modalCartela");
  function draw(filtro = "") {
    const list = (store.data().cartelas || []).filter((c) => !filtro || c.cliente.toLowerCase().includes(filtro.toLowerCase()));
    root.querySelector("#lista").innerHTML = list.length
      ? list.map((c) => {
          const cls = c.saldo < 0 ? "zero" : (c.saldo === 0 ? "zero" : "");
          return `<div class="relatorio-item cartela-item" data-nome="${escapeHtml(c.cliente)}">
            <div><strong>${escapeHtml(c.cliente)}</strong></div>
            <div class="${cls}">Saldo: <strong>${c.saldo}</strong></div>
          </div>`;
        }).join("")
      : `<p class="muted">Nenhuma cartela cadastrada.</p>`;
    root.querySelectorAll(".cartela-item").forEach((el) => {
      el.onclick = () => {
        const nome = el.dataset.nome;
        const movs = (store.data().cartelaMovs || []).filter((m) => m.cliente.toLowerCase() === nome.toLowerCase());
        const cart = (store.data().cartelas || []).find((c) => c.cliente.toLowerCase() === nome.toLowerCase());
        root.querySelector("#detalheCartela").innerHTML = `
          <h3>${escapeHtml(nome)}</h3>
          <p>SALDO ATUAL <strong>${cart ? cart.saldo : 0}</strong></p>
          ${movs.map((m) => `<div class="relatorio-item"><div>${new Date(m.ts).toLocaleString("pt-BR")} · ${m.tipo === "compra" ? "Compra" : "Uso"} · ${m.tipo === "compra" ? "+" : "-"}${m.qtd} · Saldo ${m.saldo}</div></div>`).join("") || `<p class="muted">Sem movimentacoes.</p>`}
        `;
        modal.classList.add("show");
      };
    });
  }
  root.querySelector("#closeCartela").onclick = () => modal.classList.remove("show");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("show"); };
  root.querySelector("#buscaCartela").oninput = (e) => draw(e.target.value);
  root.querySelector("#form").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qtd = Number(fd.get("qtd"));
    store.addCartela({ cliente: fd.get("cliente"), quantidade: qtd });
    e.target.reset();
    toast(`Saldo atualizado. +${qtd} cartela(s)`);
    draw(root.querySelector("#buscaCartela").value);
  };
  draw();
}

export function renderPlano(root) {
  if (!guard()) return;
  const user = store.currentUser();
  const p = store.data().perfil;
  const dias = Math.max(0, Math.ceil((p.validoAte - Date.now()) / 86400000));
  root.innerHTML = pageShell("Meu Plano", "EVS Control - Controle financeiro", `
    <div class="card">
      <h3>Meus dados</h3>
      <p>Nome <strong>${escapeHtml(user.nome)}</strong></p>
      <p>E-mail <strong>${escapeHtml(user.email)}</strong></p>
    </div>
    <div class="card">
      <h3>Alterar senha</h3>
      <form id="formSenha">
        <label class="field">Senha atual</label>
        <input name="atual" type="password" required autocomplete="current-password" />
        <label class="field">Nova senha</label>
        <input name="nova" type="password" required minlength="4" autocomplete="new-password" />
        <label class="field">Confirmar nova senha</label>
        <input name="confirma" type="password" required minlength="4" autocomplete="new-password" />
        <button type="submit">Salvar nova senha</button>
      </form>
    </div>
    <div class="card">
      <h3>Informacoes do plano</h3>
      <p>Plano <strong>${escapeHtml(p.plano)}</strong></p>
      <p>Status <strong>${escapeHtml(p.status)}</strong></p>
      <p>Valido ate <strong>${new Date(p.validoAte).toLocaleDateString("pt-BR")}</strong></p>
      <p>Dias restantes <strong>${dias}</strong></p>
      ${dias < 7 ? `<p class="muted">Seu plano esta proximo do vencimento.</p>` : ""}
    </div>
    <div class="card">
      <h3>Programa de Indicacoes</h3>
      <p>Ganhe +30 dias gratis. Indicacoes validas: <strong>${p.indicacoes||0}</strong></p>
      <button type="button" id="ind">Indicar um amigo</button>
    </div>
  `);
  root.querySelector("#ind").onclick = () => navigate("/indicar");
  root.querySelector("#formSenha").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const atual = fd.get("atual");
    const nova = fd.get("nova");
    const confirma = fd.get("confirma");
    if (nova !== confirma) {
      toast("A confirmacao nao confere com a nova senha.", "err");
      return;
    }
    if (String(nova).length < 4) {
      toast("A nova senha deve ter pelo menos 4 caracteres.", "err");
      return;
    }
    const btn = e.target.querySelector("button[type='submit']");
    btn.disabled = true;
    try {
      await store.changePassword(atual, nova);
      e.target.reset();
      toast("Senha alterada com sucesso.");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  };
}

export function renderIndicar(root) {
  if (!guard()) return;
  root.innerHTML = pageShell("Programa de Indicacoes", "Ganhe +30 dias gratis", `
    <div class="card">
      <p>Indique um amigo. Quando ele criar a conta e ativar o acesso, voce ganha 30 dias extras.</p>
      <ul class="muted">
        <li>O amigo precisa concluir o cadastro.</li>
        <li>Cada indicacao valida gera +30 dias.</li>
        <li>Os dias sao acumulativos.</li>
      </ul>
      <form id="form">
        <input name="email" type="email" placeholder="E-mail do amigo" required />
        <button>Enviar Indicacao</button>
      </form>
    </div>
  `);
  root.querySelector("#form").onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const msg = `Oi! Conheca o EVS Control, o controle financeiro para consultores. Crie sua conta e use meu e-mail ${store.currentUser().email} como indicacao: ${location.origin}${location.pathname}#/cadastro`;
    await navigator.clipboard.writeText(msg);
    toast("Mensagem copiada. Cole no WhatsApp.");
    const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(wa, "_blank");
  };
}

export function renderSuporte(root) {
  const waNumero = "27996872719";
  const waLink = `https://wa.me/55${waNumero}`;
  const email = "vivenzanutriclub@gmail.com";
  root.innerHTML = pageShell("Suporte EVS Control", "Precisa de ajuda?", `
    <div class="card">
      <p>Fale com o suporte pelo WhatsApp ou e-mail.</p>
      <p><strong>WhatsApp</strong><br><a href="${waLink}" target="_blank" rel="noopener">(27) 99687-2719</a></p>
      <p><strong>E-mail</strong><br><a href="mailto:${email}">${email}</a></p>
      <button type="button" id="copyW" class="btn-ghost">Copiar WhatsApp</button>
      <button type="button" id="copyE" class="btn-outline">Copiar e-mail</button>
    </div>
  `);
  root.querySelector("#copyW").onclick = async () => { await navigator.clipboard.writeText(waNumero); toast("WhatsApp copiado"); };
  root.querySelector("#copyE").onclick = async () => { await navigator.clipboard.writeText(email); toast("E-mail copiado"); };
}

export function renderProspectos(root) {
  if (!guard()) return;
  const list = store.data().pesquisas || [];
  root.innerHTML = pageShell("Prospectos", "Contatos da pesquisa EVS", `
    <div class="card">
      ${list.length ? `<table class="table"><thead><tr><th>Nome</th><th>Contato</th><th>Cidade</th><th>Objetivo</th></tr></thead>
        <tbody>${list.map((p)=>`<tr><td>${escapeHtml(p.nome)}</td><td>${escapeHtml(p.contato)}</td><td>${escapeHtml(p.cidade)}</td><td>${escapeHtml(p.objetivo)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="muted">Nenhum prospecto ainda. Use a Pesquisa EVS.</p>`}
      <a class="link-pill" href="#/pesquisa">Nova pesquisa</a>
    </div>
  `);
}
