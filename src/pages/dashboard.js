import { store } from "../store.js";
import { navigate } from "../router.js";
import {
  MESES, ESTADOS, DESCONTOS, formatMoney, parseMoney, todayParts,
  toast, confirmModal, escapeHtml, getDolar,
} from "../utils.js";
import { monthStats, dayStats, yearStats } from "../compute.js";
import { buscarProdutos, custoComDesconto } from "../catalog.js";

function logoSvg() {
  return `<svg class="logo-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="14" fill="#fff"/>
    <path d="M32 13 L53 32 L46 32 L32 20 L18 32 L11 32 Z" fill="#2B4ECC"/>
    <rect x="19" y="30" width="26" height="21" rx="2" fill="#2B4ECC"/>
    <rect x="28" y="39" width="8" height="12" rx="1.5" fill="#fff"/>
    <rect x="16" y="51" width="32" height="4" rx="2" fill="#A9C1F5"/>
    <path d="M49 8 C55 6 60 11 57 17 C54 23 47 21 47 15 C47 12 47.6 9.8 49 8 Z" fill="#3BA55D"/>
    <path d="M48 20 C49.5 16 52 13.5 56 12.5" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  </svg>`;
}

export function renderDashboard(root) {
  const user = store.currentUser();
  if (!user) { navigate("/login"); return; }
  const data = store.data();
  if (!data) { navigate("/login"); return; }
  const t = todayParts();
  const perfil = data.perfil;
  const anos = [];
  for (let a = t.ano - 3; a <= t.ano + 1; a++) anos.push(a);

  let ano = t.ano;
  let mes = t.mes;
  let dia = t.dia;
  let itensVenda = [];
  let dolar = 5;

  const impersonating = store.isImpersonating();
  root.innerHTML = `
    <div class="container">
      ${impersonating ? `
        <div class="impersonate-bar">
          Visualizando como <strong>${escapeHtml(user.nome)}</strong>
          <button id="voltarAdmin">Voltar ao admin</button>
        </div>` : ""}
      <div class="header">
        ${logoSvg()}
        <div class="header-centro">
          <div class="header-titulo">EVS Control</div>
          <div class="header-sub">Controle financeiro</div>
        </div>
        <div class="header-direita">
          <div class="header-usuario" id="usuarioNome">${escapeHtml(user.nome)}</div>
          <button class="btn-sair" id="btnSair">Sair</button>
          ${store.isAdmin() ? `<button class="btn-sair" id="btnAdmin" style="color:#FFD54F">Admin</button>` : ""}
          <div class="config-produtos">
            <select id="estadoCliente">${ESTADOS.map((e) => `<option ${perfil.estado===e?"selected":""}>${e}</option>`).join("")}</select>
            <select id="descontoCliente">${DESCONTOS.map((d) => `<option value="${d}" ${Number(perfil.desconto)===d?"selected":""}>${d}%</option>`).join("")}</select>
          </div>
        </div>
        <div class="filtros">
          <select id="anoSelecionado">${anos.map((a)=>`<option ${a===ano?"selected":""}>${a}</option>`).join("")}</select>
          <select id="mesSelecionado">${MESES.map((m,i)=>`<option value="${i}" ${i===mes?"selected":""}>${m}</option>`).join("")}</select>
          <select id="diaSelecionado"></select>
        </div>
      </div>

      <div class="resumo">
        <div class="box">
          <div class="box-titulo">Faturamento mes atual</div>
          <span id="mesFaturamento">R$ 0,00</span>
          <div class="box-sub" id="projecaoMes">Probabilidade no mes: —</div>
        </div>
        <div class="box">
          <div class="box-titulo">Lucro mes atual</div>
          <span id="mesLucro">R$ 0,00</span>
          <div class="box-sub" id="projecaoLucro">Probabilidade no mes: —</div>
        </div>
      </div>

      <button type="button" id="btnResumo">Resumo de Ganhos</button>
      <div class="pv-box">
        Pontos de volume <strong id="pontosVolume">0</strong>
        &nbsp; Projecao Pv: <strong id="projecaoPV">—</strong>
      </div>

      <div class="dia-topo">
        <button class="btn-relatorio" id="btnRelatorioDiario">Relatorio Diario</button>
        <button class="btn-relatorio" id="btnRelatorioAnual">Relatorio Anual</button>
      </div>
      <div class="total-mess">
        <span>Total acessos: <strong id="totalAcessosMes">0</strong></span>
        <span>Media diaria: <strong id="mediaAcessosDia">0</strong></span>
        <span>Ticket medio: <strong id="ticketMedio">R$ 0,00</strong></span>
      </div>

      <div class="section">
        <h3 class="titulo-acessos">Registro diario de acessos <span class="tag" id="diaAcessos">0</span></h3>
        <div class="relative">
          <input id="acessoNome" placeholder="Cliente" autocomplete="off" />
          <div id="sugestoesClientes" class="sugestoes"></div>
        </div>
        <input id="acessoValor" type="number" step="0.01" placeholder="Valor" />
        <div class="ultimo-acesso" id="ultimoAcesso" style="display:none">
          <span>Ultimo acesso salvo:</span>
          <span class="ultimo-nome" id="ultimoNome"></span>
          <span id="ultimoValor"></span>
        </div>
        <button type="button" id="btnAdicionarAcesso">Adicionar Acesso</button>
      </div>

      <a href="#/cartelas" class="link-cartelas">&gt;&gt; Cartelas antecipadas &lt;&lt;</a>
      <div class="center" style="margin-bottom:16px">
        <a href="#/pesquisa" class="link-pill">Pesquisa EVS</a>
      </div>

      <div class="section">
        <h3 class="titulo-acessos">Vendas de Produtos Fechados <span class="tag" id="diaVendas">0</span></h3>
        <a href="#/precos" class="link-soft">Tabela de precos</a>
        <input id="vendaNome" placeholder="Cliente" />
        <div class="relative">
          <input id="vendaProdutoBusca" placeholder="Digite o nome do produto" autocomplete="off" />
          <div id="resultadosProdutosVenda" class="resultados"></div>
        </div>
        <button type="button" class="btn-manual" id="btnProdutoManual">+ Produto manual</button>
        <div id="itensVendaSelecionados" class="itens-venda"></div>
        <div class="resumo-venda">
          <div class="resumo-linha"><span>Custo total:</span><strong id="custoTotalVenda">R$ 0,00</strong></div>
          <input id="vendaValor" inputmode="decimal" placeholder="Valor de venda" />
          <div class="resumo-linha"><span>Lucro:</span><strong id="lucroVenda">R$ 0,00</strong></div>
        </div>
        <div class="ultimo-acesso" id="ultimaVenda" style="display:none">
          <span>Ultima venda:</span>
          <span class="ultimo-nome" id="ultimaVendaNome"></span>
          <span id="ultimaVendaValor"></span>
        </div>
        <button type="button" id="btnAdicionarVenda">Adicionar Venda</button>
      </div>

      <div class="section">
        <h3 class="titulo-acessos">
          Recrutamento mes
          <span>D</span><span class="tag" id="distMes">0</span>
          <span>S</span><span class="tag" id="supMes">0</span>
        </h3>
        <div class="metas">
          <div>
            <label>Meta de novos Distribuidores</label>
            <input id="metaDistribuidores" type="number" min="0" placeholder="Meta D" />
          </div>
          <div>
            <label>Meta de novos Supervisores</label>
            <input id="metaSupervisores" type="number" min="0" placeholder="Meta S" />
          </div>
        </div>
        <button type="button" class="btn-relatorio" id="btnRelatorioRecrutamento">Relatorio de Recrutamento</button>
        <div style="display:flex;justify-content:center;gap:16px;margin:12px 0 8px">
          <a href="#/prospectos" class="link-soft">Prospectos</a>
          <a href="#/pesquisa" class="link-soft">Cadastro EVS</a>
        </div>
        <input id="distribuidorNome" placeholder="Nome do novo distribuidor" />
        <button type="button" id="btnAdicionarDistribuidor">Adicionar Distribuidor</button>
        <input id="supervisorNome" placeholder="Nome do novo supervisor" />
        <button type="button" id="btnAdicionarSupervisor">Adicionar Supervisor</button>
      </div>

      <div class="fechamento">
        <div class="entrada">Entrada<strong id="diaEntrada">R$ 0,00</strong></div>
        <div class="custo">Custo<strong id="diaCusto">R$ 0,00</strong></div>
        <div class="lucro">Lucro<strong id="diaLucro">R$ 0,00</strong></div>
      </div>
      <div class="fechamento">
        <div class="entrada">Recebimentos</div>
        <div class="custo"><a href="#/fechamento" style="text-decoration:none;color:inherit;font-weight:700">Conta de Produtos</a></div>
        <div class="lucro">Conta de lucro</div>
      </div>
      <div class="center" style="margin:14px 0 4px">
        <a href="#/fechamento" class="link-cartelas" style="font-size:20px">Fechamento do caixa</a>
        <div class="hint">Clique acima para acessar o fechamento do caixa</div>
      </div>

      <button class="btn-amber" id="btnIndicar">
        <div style="font-size:20px">Indique o EVS Control</div>
        <div style="font-size:14px;font-weight:500;margin-top:4px">Ganhe <strong>+30 dias gratis</strong> por cada amigo.</div>
      </button>
      <div class="center">
        <a href="#/plano">Consultar meu plano</a>
        <span class="muted"> · </span>
        <a href="#/plano">Alterar senha</a>
      </div>

      <footer class="footer-chefe">
        <button type="button" id="btnColab">Gerenciar colaboradores</button>
        <button type="button" id="btnInv">Inventario - Estoque de produtos</button>
        <div class="footer-marca">COMO USAR - EVS Control (c) ${t.ano}</div>
        <div class="footer-links">
          <a href="#/gestao">Gestao Financeira</a>
          <a href="#/precificador">Precificador</a>
          <a href="#/suporte">Suporte</a>
        </div>
      </footer>
    </div>
    <div class="modal" id="modal">
      <div class="modal-content">
        <div class="close" id="closeModal">X</div>
        <div id="relatorio"></div>
      </div>
    </div>
  `;

  const $ = (id) => root.querySelector(id);
  const diaSelect = $("#diaSelecionado");

  function fillDays() {
    const n = new Date(ano, mes + 1, 0).getDate();
    diaSelect.innerHTML = Array.from({ length: n }, (_, i) => {
      const d = i + 1;
      return `<option value="${d}" ${d === dia ? "selected" : ""}>Dia ${d}</option>`;
    }).join("");
  }
  fillDays();

  function refreshLast() {
    const la = data.lastAcesso;
    if (la && Number(la.dia) === Number(dia) && Number(la.mes) === Number(mes) && Number(la.ano) === Number(ano)) {
      $("#ultimoAcesso").style.display = "flex";
      $("#ultimoNome").textContent = la.nome;
      $("#ultimoValor").textContent = formatMoney(la.valor);
    } else $("#ultimoAcesso").style.display = "none";
    const lv = data.lastVenda;
    if (lv && Number(lv.dia) === Number(dia) && Number(lv.mes) === Number(mes) && Number(lv.ano) === Number(ano)) {
      $("#ultimaVenda").style.display = "flex";
      $("#ultimaVendaNome").textContent = lv.nome;
      $("#ultimaVendaValor").textContent = formatMoney(lv.valor);
    } else $("#ultimaVenda").style.display = "none";
  }

  async function refresh() {
    const m = monthStats(data, ano, mes);
    const d = dayStats(data, ano, mes, dia);
    $("#mesFaturamento").textContent = formatMoney(m.faturamento);
    $("#mesLucro").textContent = formatMoney(m.lucro);
    $("#projecaoMes").textContent = m.projFat == null ? "Probabilidade no mes: —" : `Probabilidade no mes: ${formatMoney(m.projFat)}`;
    $("#projecaoLucro").textContent = m.projLucro == null ? "Probabilidade no mes: —" : `Probabilidade no mes: ${formatMoney(m.projLucro)}`;
    $("#totalAcessosMes").textContent = m.totalAcessos;
    $("#mediaAcessosDia").textContent = Number(m.mediaAcessos).toFixed(1);
    $("#ticketMedio").textContent = formatMoney(m.ticket);
    $("#diaAcessos").textContent = d.nAcessos;
    $("#diaVendas").textContent = d.nVendas;
    $("#diaAcessos").classList.toggle("zero", d.nAcessos === 0);
    $("#diaVendas").classList.toggle("zero", d.nVendas === 0);
    $("#distMes").textContent = m.dist;
    $("#supMes").textContent = m.sup;
    $("#distMes").classList.toggle("zero", m.dist === 0);
    $("#supMes").classList.toggle("zero", m.sup === 0);
    $("#diaEntrada").textContent = formatMoney(d.entrada);
    $("#diaCusto").textContent = formatMoney(d.custo);
    $("#diaLucro").textContent = formatMoney(d.lucro);
    const pv = m.faturamento - m.lucro > 0 ? (m.faturamento - m.lucro) / dolar : 0;
    $("#pontosVolume").textContent = Math.floor(pv);
    const projPv = m.projFat != null && m.projLucro != null
      ? Math.max(0, (m.projFat - m.projLucro) / dolar)
      : null;
    $("#projecaoPV").textContent = projPv == null ? "—" : Math.floor(projPv).toLocaleString("pt-BR");
    const metas = store.getMetas(ano, mes);
    $("#metaDistribuidores").value = metas.d || "";
    $("#metaSupervisores").value = metas.s || "";
    refreshLast();
  }

  getDolar().then((v) => { dolar = v; refresh(); });

  $("#anoSelecionado").onchange = (e) => { ano = Number(e.target.value); fillDays(); refresh(); };
  $("#mesSelecionado").onchange = (e) => { mes = Number(e.target.value); if (dia > new Date(ano, mes + 1, 0).getDate()) dia = 1; fillDays(); refresh(); };
  $("#diaSelecionado").onchange = (e) => { dia = Number(e.target.value); refresh(); };
  $("#estadoCliente").onchange = (e) => store.setPerfil({ estado: e.target.value });
  $("#descontoCliente").onchange = (e) => store.setPerfil({ desconto: Number(e.target.value) });
  $("#btnSair").onclick = () => { store.logout(); navigate("/login"); };
  if ($("#btnAdmin")) $("#btnAdmin").onclick = () => navigate("/admin");
  if ($("#voltarAdmin")) $("#voltarAdmin").onclick = async () => { await store.stopImpersonate(); navigate("/admin"); };
  $("#btnResumo").onclick = () => navigate("/resumo");
  $("#btnIndicar").onclick = () => navigate("/indicar");
  $("#btnColab").onclick = () => navigate("/colaboradores");
  $("#btnInv").onclick = () => navigate("/inventario");

  $("#acessoNome").addEventListener("input", () => {
    const box = $("#sugestoesClientes");
    const t = $("#acessoNome").value.trim().toLowerCase();
    if (!t) { box.style.display = "none"; return; }
    const found = (data.cartelas || []).filter((c) => c.cliente.toLowerCase().includes(t)).slice(0, 5);
    if (!found.length) { box.style.display = "none"; return; }
    box.innerHTML = found.map((c) => `
      <div class="sugestao-item" data-nome="${escapeHtml(c.cliente)}">
        <strong>${escapeHtml(c.cliente)}</strong>
        <small>Saldo: ${c.saldo} cartela${c.saldo===1?"":"s"}</small>
      </div>`).join("");
    box.style.display = "block";
    box.querySelectorAll(".sugestao-item").forEach((el) => {
      el.onclick = () => { $("#acessoNome").value = el.dataset.nome; box.style.display = "none"; };
    });
  });

  $("#btnAdicionarAcesso").onclick = () => {
    const cliente = $("#acessoNome").value.trim();
    const valor = Number($("#acessoValor").value);
    if (!cliente || !valor) { toast("Preencha todos os campos", "err"); return; }
    store.addAcesso({ cliente, valor, dia, mes, ano });
    store.useCartela(cliente);
    $("#acessoNome").value = "";
    $("#acessoValor").value = "";
    $("#acessoNome").focus();
    toast("Acesso salvo");
    refresh();
  };

  function renderItens() {
    const box = $("#itensVendaSelecionados");
    if (!itensVenda.length) { box.innerHTML = ""; atualizarResumo(); return; }
    box.innerHTML = itensVenda.map((it, i) => `
      <div class="linha-item">
        <div class="produto-nome">${escapeHtml(it.produto)}</div>
        <div class="controle-qtd">
          <button type="button" data-minus="${i}">-</button>
          <span>${it.quantidade}</span>
          <button type="button" data-plus="${i}">+</button>
        </div>
        <div class="produto-custo">${formatMoney(it.custo * it.quantidade)}</div>
        <button type="button" class="btn-apagar" data-del="${i}">x</button>
      </div>`).join("");
    box.querySelectorAll("[data-minus]").forEach((b) => b.onclick = () => { const i=+b.dataset.minus; itensVenda[i].quantidade=Math.max(1,itensVenda[i].quantidade-1); renderItens(); });
    box.querySelectorAll("[data-plus]").forEach((b) => b.onclick = () => { itensVenda[+b.dataset.plus].quantidade++; renderItens(); });
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { itensVenda.splice(+b.dataset.del,1); renderItens(); });
    atualizarResumo();
  }

  function atualizarResumo() {
    const custo = itensVenda.reduce((s, i) => s + i.custo * i.quantidade, 0);
    const venda = parseMoney($("#vendaValor").value);
    $("#custoTotalVenda").textContent = formatMoney(custo);
    $("#lucroVenda").textContent = formatMoney(venda - custo);
  }
  $("#vendaValor").addEventListener("input", atualizarResumo);

  $("#vendaProdutoBusca").addEventListener("input", () => {
    const box = $("#resultadosProdutosVenda");
    const list = buscarProdutos($("#vendaProdutoBusca").value);
    if (!list.length) { box.style.display = "none"; return; }
    const desc = Number($("#descontoCliente").value) || 0;
    box.innerHTML = list.map((p) => `
      <div class="item-produto" data-id="${p.id}">
        ${escapeHtml(p.nome)}
        <small style="display:block;color:#777">Custo: ${formatMoney(custoComDesconto(p.preco, desc))} · PV ${p.pv}</small>
      </div>`).join("");
    box.style.display = "block";
    box.querySelectorAll(".item-produto").forEach((el) => {
      el.onclick = () => {
        const p = list.find((x) => x.id === el.dataset.id);
        const desc = Number($("#descontoCliente").value) || 0;
        const existing = itensVenda.find((i) => i.produto === p.nome);
        if (existing) existing.quantidade += 1;
        else itensVenda.push({ produto: p.nome, quantidade: 1, custo: custoComDesconto(p.preco, desc), pv: p.pv });
        $("#vendaProdutoBusca").value = "";
        box.style.display = "none";
        renderItens();
      };
    });
  });

  $("#btnProdutoManual").onclick = () => {
    const nome = prompt("Nome do produto");
    if (!nome) return;
    const custo = Number(prompt("Custo unitario") || 0);
    itensVenda.push({ produto: nome, quantidade: 1, custo, pv: 0 });
    renderItens();
  };

  $("#btnAdicionarVenda").onclick = () => {
    const cliente = $("#vendaNome").value.trim();
    const valor = parseMoney($("#vendaValor").value);
    if (!cliente) { toast("Informe o cliente.", "err"); return; }
    if (!valor) { toast("Informe o valor de venda.", "err"); return; }
    if (!itensVenda.length) { toast("Adicione pelo menos um produto.", "err"); return; }
    store.addVenda({ cliente, valor, itens: itensVenda.map((i)=>({...i})), dia, mes, ano });
    $("#vendaNome").value = "";
    $("#vendaValor").value = "";
    itensVenda = [];
    renderItens();
    toast("Venda registrada");
    refresh();
  };

  function saveMeta() {
    store.setMetas(ano, mes, {
      d: Number($("#metaDistribuidores").value) || 0,
      s: Number($("#metaSupervisores").value) || 0,
    });
  }
  $("#metaDistribuidores").onchange = saveMeta;
  $("#metaSupervisores").onchange = saveMeta;

  $("#btnAdicionarDistribuidor").onclick = () => {
    const nome = $("#distribuidorNome").value.trim();
    if (!nome) { toast("Informe o nome", "err"); return; }
    store.addRecrutamento({ nome, tipo: "D", dia, mes, ano });
    $("#distribuidorNome").value = "";
    toast("Distribuidor adicionado");
    refresh();
  };
  $("#btnAdicionarSupervisor").onclick = () => {
    const nome = $("#supervisorNome").value.trim();
    if (!nome) { toast("Informe o nome", "err"); return; }
    store.addRecrutamento({ nome, tipo: "S", dia, mes, ano });
    $("#supervisorNome").value = "";
    toast("Supervisor adicionado");
    refresh();
  };

  const modal = $("#modal");
  $("#closeModal").onclick = () => modal.classList.remove("show");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("show"); };

  function openModal(html) {
    $("#relatorio").innerHTML = html;
    modal.classList.add("show");
  }

  $("#btnRelatorioDiario").onclick = async () => {
    const d = dayStats(data, ano, mes, dia);
    const htmlAcessos = d.acessos.map((a) => `
      <div class="relatorio-item">
        <div><div class="relatorio-nome">${escapeHtml(a.cliente)}</div><div>${formatMoney(a.valor)}</div></div>
        <button class="btn-apagar" data-acc="${a.id}">Apagar</button>
      </div>`).join("") || `<p class="muted">Nenhum acesso neste dia.</p>`;
    const htmlVendas = d.vendas.map((v) => `
      <div class="relatorio-item">
        <div>
          <div class="relatorio-nome">${escapeHtml(v.cliente)}</div>
          <div>${v.itens.map((i)=>`${i.quantidade}x ${escapeHtml(i.produto)}`).join(", ")}</div>
          <div><strong>${formatMoney(v.valor)}</strong> · lucro ${formatMoney(v.lucro)}</div>
        </div>
        <button class="btn-apagar" data-ven="${v.id}">Apagar</button>
      </div>`).join("") || `<p class="muted">Nenhuma venda neste dia.</p>`;
    openModal(`
      <h3>Relatorio Diario · ${dia} ${MESES[mes]} ${ano}</h3>
      <p class="muted">Entrada ${formatMoney(d.entrada)} · Custo ${formatMoney(d.custo)} · Lucro ${formatMoney(d.lucro)}</p>
      <h4 style="color:#0050ff">Acessos</h4>${htmlAcessos}
      <h4 style="color:#0050ff">Vendas</h4>${htmlVendas}
    `);
    $("#relatorio").querySelectorAll("[data-acc]").forEach((b) => b.onclick = async () => {
      if (await confirmModal("Deseja apagar este acesso?")) { store.removeById("acessos", b.dataset.acc); modal.classList.remove("show"); refresh(); }
    });
    $("#relatorio").querySelectorAll("[data-ven]").forEach((b) => b.onclick = async () => {
      if (await confirmModal("Deseja apagar esta venda?")) { store.removeById("vendas", b.dataset.ven); modal.classList.remove("show"); refresh(); }
    });
  };

  $("#btnRelatorioAnual").onclick = () => {
    const rows = yearStats(data, ano);
    const total = rows.reduce((s, r) => s + r.total, 0);
    openModal(`
      <h3>Relatorio Anual ${ano}</h3>
      <table class="table">
        <thead><tr><th>Mes</th><th>Lucro EVS</th><th>Vendas</th><th>Total</th></tr></thead>
        <tbody>
          ${rows.map((r)=>`<tr><td>${r.nome}</td><td>${formatMoney(r.lucroEvs)}</td><td>${formatMoney(r.lucroVendas)}</td><td><strong>${formatMoney(r.total)}</strong></td></tr>`).join("")}
        </tbody>
      </table>
      <p><strong>Total do ano: ${formatMoney(total)}</strong></p>
    `);
  };

  $("#btnRelatorioRecrutamento").onclick = () => {
    const m = monthStats(data, ano, mes);
    const metas = store.getMetas(ano, mes);
    const list = m.rec.map((r) => `
      <div class="relatorio-item">
        <div><strong>${escapeHtml(r.nome)}</strong> · ${r.tipo === "D" ? "Distribuidor" : "Supervisor"} · dia ${r.dia}</div>
        <button class="btn-apagar" data-rec="${r.id}">Apagar</button>
      </div>`).join("") || `<p class="muted">Nenhum recrutamento neste mes.</p>`;
    openModal(`
      <h3>Recrutamento · ${MESES[mes]} ${ano}</h3>
      <p>D ${m.dist}/${metas.d || 0} · S ${m.sup}/${metas.s || 0}</p>
      ${list}
    `);
    $("#relatorio").querySelectorAll("[data-rec]").forEach((b) => b.onclick = async () => {
      if (await confirmModal("Apagar este registro?")) { store.removeById("recrutamento", b.dataset.rec); modal.classList.remove("show"); refresh(); }
    });
  };

  refresh();
}
