import { store } from "../store.js";
import { navigate } from "../router.js";
import { formatMoney, escapeHtml, toast, confirmModal } from "../utils.js";

let tab = "clientes";

function openForm(title, fields, onSubmit) {
  const wrap = document.createElement("div");
  wrap.className = "modal show";
  wrap.innerHTML = `
    <div class="modal-content">
      <div class="close" data-x>X</div>
      <h3>${escapeHtml(title)}</h3>
      <form>
        ${fields
          .map((f) => {
            if (f.type === "select") {
              return `<label class="field">${escapeHtml(f.label)}</label>
                <select name="${f.name}">
                  ${f.options.map((o) => `<option value="${o.value}" ${String(o.value) === String(f.value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
                </select>`;
            }
            return `<label class="field">${escapeHtml(f.label)}</label>
              <input name="${f.name}" type="${f.type || "text"}" value="${escapeHtml(f.value ?? "")}" placeholder="${escapeHtml(f.placeholder || "")}" ${f.required ? "required" : ""} />`;
          })
          .join("")}
        <button>Salvar</button>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector("[data-x]").onclick = close;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const values = {};
    fields.forEach((f) => (values[f.name] = fd.get(f.name)));
    onSubmit(values);
    close();
  };
}

function statusBadge(c) {
  if (c.perfil.status === "suspenso") return `<span class="badge badge-red">Suspenso</span>`;
  if (c.vencido) return `<span class="badge badge-red">Vencido</span>`;
  if (c.expirando) return `<span class="badge badge-amber">Vence em ${c.dias}d</span>`;
  return `<span class="badge badge-green">Ativo · ${c.dias}d</span>`;
}

export async function renderAdmin(root) {
  if (!store.currentUser()) { navigate("/login"); return; }
  if (!store.isAdmin()) { toast("Acesso restrito ao administrador.", "err"); navigate("/"); return; }

  root.innerHTML = `<div class="auth-wrap"><div class="auth-card" style="text-align:center">Carregando painel...</div></div>`;
  try {
    await store.adminLoad();
  } catch (err) {
    toast(err.message, "err");
    navigate("/");
    return;
  }

  const planos = store.planos();
  const stats = store.adminStatsData() || {};
  const clients = store.adminListClients();
  const licenses = store.listLicenses();

  root.innerHTML = `
    <div class="container" style="max-width:520px">
      <div class="header" style="min-height:96px">
        <div class="header-centro">
          <div class="header-titulo">PAINEL ADMIN</div>
          <div class="header-sub">Gestao de clientes e revenda</div>
        </div>
        <div class="header-direita">
          <div class="header-usuario">${escapeHtml(store.currentUser().nome)}</div>
          <button class="btn-sair" id="btnPainel">Painel</button>
          <button class="btn-sair" id="btnSairAdm">Sair</button>
        </div>
      </div>

      <div class="kpi" style="margin-top:12px">
        <div class="card"><span class="muted">Clientes</span><strong>${stats.clientes || 0}</strong></div>
        <div class="card"><span class="muted">Ativos</span><strong>${stats.ativos || 0}</strong></div>
        <div class="card"><span class="muted">Vencidos</span><strong>${stats.vencidos || 0}</strong></div>
        <div class="card"><span class="muted">Vencendo em 7d</span><strong>${stats.expirando || 0}</strong></div>
        <div class="card"><span class="muted">Receita mensal</span><strong>${formatMoney(stats.mrr)}</strong></div>
        <div class="card"><span class="muted">Receita revenda</span><strong>${formatMoney(stats.receita)}</strong></div>
        <div class="card"><span class="muted">Licencas livres</span><strong>${stats.licencasDisponiveis || 0}</strong></div>
        <div class="card"><span class="muted">Licencas vendidas</span><strong>${stats.licencasVendidas || 0}</strong></div>
      </div>

      <div class="tabs">
        <button data-tab="clientes" class="${tab === "clientes" ? "active" : ""}">Clientes</button>
        <button data-tab="licencas" class="${tab === "licencas" ? "active" : ""}">Licencas / Revenda</button>
        <button data-tab="planos" class="${tab === "planos" ? "active" : ""}">Planos</button>
      </div>

      <div id="adminBody"></div>
    </div>
  `;

  root.querySelector("#btnPainel").onclick = () => navigate("/");
  root.querySelector("#btnSairAdm").onclick = () => { store.logout(); navigate("/login"); };
  root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderAdmin(root); }));

  const body = root.querySelector("#adminBody");
  if (tab === "clientes") renderClientes(body, planos, clients);
  else if (tab === "licencas") renderLicencas(body, planos, licenses);
  else renderPlanos(body, planos);
}

function renderClientes(body, planos, clients) {
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Novo cliente</h3>
      <form id="novoCliente">
        <input name="nome" placeholder="Nome" required />
        <input name="email" type="email" placeholder="E-mail" required />
        <input name="senha" placeholder="Senha inicial (padrao 123456)" />
        <label class="field">Plano</label>
        <select name="planoKey">
          ${planos.map((p) => `<option value="${p.key}">${escapeHtml(p.nome)} · ${formatMoney(p.preco)} · ${p.dias}d</option>`).join("")}
        </select>
        <label class="field">Dias (deixe vazio para usar o plano)</label>
        <input name="dias" type="number" min="1" placeholder="Dias" />
        <button>Criar cliente</button>
      </form>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Clientes (${clients.length})</h3>
      <input id="buscaCli" placeholder="Buscar por nome ou e-mail" />
      <div id="listaCli"></div>
    </div>`;

  const draw = (filtro = "") => {
    const t = filtro.toLowerCase();
    const list = store.adminListClients().filter((c) =>
      !t || [c.nome, c.email].join(" ").toLowerCase().includes(t)
    );
    body.querySelector("#listaCli").innerHTML = list.map((c) => `
      <div class="cli-row">
        <div class="cli-info">
          <div><strong>${escapeHtml(c.nome)}</strong> ${statusBadge(c)}</div>
          <div class="muted">${escapeHtml(c.email)}</div>
          <div class="muted">${escapeHtml(c.perfil.plano || "-")} · vence ${c.perfil.validoAte ? new Date(c.perfil.validoAte).toLocaleDateString("pt-BR") : "-"}</div>
        </div>
        <div class="cli-actions">
          <button data-act="entrar" data-id="${c.id}" class="btn-soft">Entrar como</button>
          <button data-act="renovar" data-id="${c.id}" class="btn-soft">+30d</button>
          <button data-act="editar" data-id="${c.id}" class="btn-soft">Editar</button>
          <button data-act="senha" data-id="${c.id}" class="btn-soft">Senha</button>
          <button data-act="status" data-id="${c.id}" class="btn-soft ${c.perfil.status === "suspenso" ? "" : "danger"}">
            ${c.perfil.status === "suspenso" ? "Reativar" : "Suspender"}
          </button>
        </div>
      </div>`).join("") || `<p class="muted">Nenhum cliente.</p>`;

    body.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const act = b.dataset.act;
        const c = store.adminListClients().find((x) => x.id === id);
        try {
          if (act === "entrar") {
            await store.impersonate(id);
            navigate("/");
          } else if (act === "renovar") {
            await store.adminAddDays(id, 30);
            toast("+30 dias adicionados");
            renderAdmin(document.getElementById("app"));
          } else if (act === "editar") {
            openForm(
              `Editar ${c.nome}`,
              [
                { name: "nome", label: "Nome", value: c.nome, required: true },
                { name: "email", label: "E-mail", type: "email", value: c.email, required: true },
                {
                  name: "planoKey",
                  label: "Plano",
                  type: "select",
                  value: c.perfil.planoKey,
                  options: planos.map((p) => ({ value: p.key, label: `${p.nome} · ${p.dias}d` })),
                },
                {
                  name: "status",
                  label: "Status",
                  type: "select",
                  value: c.perfil.status || "ativo",
                  options: [
                    { value: "ativo", label: "Ativo" },
                    { value: "suspenso", label: "Suspenso" },
                  ],
                },
                { name: "dias", label: "Dias a partir de hoje", type: "number", value: Math.max(0, c.dias) },
              ],
              async (v) => {
                try {
                  await store.adminUpdateClient(id, {
                    nome: v.nome,
                    email: v.email,
                    planoKey: v.planoKey,
                    status: v.status,
                    dias: Number(v.dias),
                  });
                  toast("Cliente atualizado");
                  renderAdmin(document.getElementById("app"));
                } catch (err) { toast(err.message, "err"); }
              }
            );
          } else if (act === "senha") {
            openForm("Nova senha", [{ name: "senha", label: "Nova senha", value: "", required: true }], async (v) => {
              await store.adminSetPassword(id, v.senha);
              toast("Senha alterada");
            });
          } else if (act === "status") {
            const suspenso = c.perfil.status === "suspenso";
            if (!suspenso) {
              const ok = await confirmModal("Suspender o acesso deste cliente?");
              if (!ok) return;
            }
            await store.adminSetStatus(id, suspenso ? "ativo" : "suspenso");
            toast(suspenso ? "Cliente reativado" : "Cliente suspenso");
            renderAdmin(document.getElementById("app"));
          }
        } catch (err) {
          toast(err.message, "err");
        }
      };
    });
  };

  body.querySelector("#buscaCli").oninput = (e) => draw(e.target.value);

  body.querySelector("#novoCliente").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await store.adminCreateClient({
        nome: fd.get("nome"),
        email: fd.get("email"),
        senha: fd.get("senha") || "123456",
        planoKey: fd.get("planoKey"),
        dias: fd.get("dias") ? Number(fd.get("dias")) : undefined,
      });
      toast("Cliente criado");
      renderAdmin(document.getElementById("app"));
    } catch (err) { toast(err.message, "err"); }
  };
  draw();
}

function renderLicencas(body, planos, licenses) {
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Gerar licencas para revenda</h3>
      <form id="formLic">
        <label class="field">Plano</label>
        <select name="planoKey">
          ${planos.map((p) => `<option value="${p.key}">${escapeHtml(p.nome)} · ${formatMoney(p.preco)} · ${p.dias}d</option>`).join("")}
        </select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label class="field">Quantidade</label><input name="qtd" type="number" min="1" value="1" /></div>
          <div><label class="field">Preco unitario</label><input name="preco" type="number" step="0.01" placeholder="Preco do plano" /></div>
        </div>
        <label class="field">Comprador / observacao</label>
        <input name="comprador" placeholder="Ex.: revendedor Joao" />
        <button>Gerar licencas</button>
      </form>
      <p class="muted">Entregue o codigo ao cliente. No cadastro, ele informa o codigo e o plano e ativado automaticamente.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Licencas (${licenses.length})</h3>
      <div id="listaLic"></div>
    </div>`;

  const draw = () => {
    const list = store.listLicenses();
    body.querySelector("#listaLic").innerHTML = list.map((l) => `
      <div class="lic-row">
        <div>
          <code class="lic-code">${l.code}</code>
          <div class="muted">${escapeHtml(l.planoNome || l.plano_nome)} · ${l.dias}d · ${formatMoney(l.preco)} ${l.comprador ? "· " + escapeHtml(l.comprador) : ""}</div>
        </div>
        <div class="cli-actions">
          <span class="badge ${l.status === "disponivel" ? "badge-green" : "badge-gray"}">${l.status === "disponivel" ? "Livre" : "Usada"}</span>
          <button data-copy="${l.code}" class="btn-soft">Copiar</button>
          <button data-toggle="${l.id}" class="btn-soft">${l.status === "disponivel" ? "Marcar usada" : "Liberar"}</button>
        </div>
      </div>`).join("") || `<p class="muted">Nenhuma licenca.</p>`;

    body.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      await navigator.clipboard.writeText(b.dataset.copy);
      toast("Codigo copiado");
    }));
    body.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => {
      await store.useLicenseManual(b.dataset.toggle);
      renderAdmin(document.getElementById("app"));
    }));
  };

  body.querySelector("#formLic").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const out = await store.generateLicenses({
        planoKey: fd.get("planoKey"),
        qtd: Number(fd.get("qtd")) || 1,
        preco: fd.get("preco") === "" ? null : Number(fd.get("preco")),
        comprador: fd.get("comprador"),
      });
      toast(`${out.length} licenca(s) gerada(s)`);
      renderAdmin(document.getElementById("app"));
    } catch (err) { toast(err.message, "err"); }
  };
  draw();
}

function renderPlanos(body, planos) {
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Planos e precos</h3>
      <p class="muted">Edite os valores que voce cobra dos seus clientes.</p>
      <div id="listaPlanos"></div>
      <button id="salvarPlanos">Salvar planos</button>
    </div>`;
  body.querySelector("#listaPlanos").innerHTML = planos.map((p, i) => `
    <div class="card" style="margin:0 0 8px;padding:10px">
      <label class="field">Nome</label>
      <input data-i="${i}" data-k="nome" value="${escapeHtml(p.nome)}" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label class="field">Preco (R$)</label><input data-i="${i}" data-k="preco" type="number" step="0.01" value="${p.preco}" /></div>
        <div><label class="field">Dias</label><input data-i="${i}" data-k="dias" type="number" value="${p.dias}" /></div>
      </div>
    </div>`).join("");

  body.querySelector("#salvarPlanos").onclick = async () => {
    const novos = store.planos().map((p) => ({ ...p }));
    body.querySelectorAll("#listaPlanos input").forEach((inp) => {
      const i = Number(inp.dataset.i);
      const k = inp.dataset.k;
      novos[i][k] = k === "nome" ? inp.value : Number(inp.value);
    });
    try {
      await store.setPlanos(novos);
      toast("Planos salvos");
      renderAdmin(document.getElementById("app"));
    } catch (err) { toast(err.message, "err"); }
  };
}
