import "./styles.css";
import { register, startRouter, navigate, currentPath } from "./router.js";
import { store } from "./store.js";
import { renderLogin, renderCadastro, renderRecuperar } from "./pages/login.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderAdmin } from "./pages/admin.js";
import {
  renderPesquisa, renderPrecos, renderFechamento, renderResumo, renderGestao,
  renderPrecificador, renderInventario, renderColaboradores, renderCartelas,
  renderPlano, renderIndicar, renderSuporte, renderProspectos, renderAuditoria,
} from "./pages/pages.js";

function auth(render, perm) {
  return (root) => {
    if (!store.currentUser()) {
      navigate("/login");
      return;
    }
    if (perm && !store.can(perm)) {
      navigate("/");
      return;
    }
    render(root);
  };
}

function guest(render) {
  return (root) => {
    if (store.currentUser() && currentPath() !== "/login") {
      /* keep login accessible */
    }
    render(root);
  };
}

register("/", auth(renderDashboard));
register("/admin", (root) => {
  if (!store.currentUser()) { navigate("/login"); return; }
  if (!store.isAdmin()) { navigate("/"); return; }
  renderAdmin(root);
});
register("/login", guest(renderLogin));
register("/cadastro", guest(renderCadastro));
register("/recuperar", guest(renderRecuperar));
register("/pesquisa", auth(renderPesquisa, "customers.view"));
register("/precos", auth(renderPrecos, "pricing.view"));
register("/fechamento", auth(renderFechamento, "cash.view"));
register("/resumo", auth(renderResumo, "reports.financial"));
register("/gestao", auth(renderGestao, "finance.view"));
register("/precificador", auth(renderPrecificador, "pricing.view"));
register("/inventario", auth(renderInventario, "inventory.view"));
register("/colaboradores", auth(renderColaboradores, "team.view"));
register("/cartelas", auth(renderCartelas, "cards.view"));
register("/plano", auth(renderPlano, "plan.view"));
register("/indicar", auth(renderIndicar, "plan.view"));
register("/suporte", renderSuporte);
register("/prospectos", auth(renderProspectos, "customers.view"));
register("/auditoria", auth(renderAuditoria, "audit.view"));
register("/404", (root) => {
  root.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h2>Pagina nao encontrada</h2><a href="#/">Voltar</a></div></div>`;
});

async function boot() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="auth-wrap"><div class="auth-card" style="text-align:center">Carregando...</div></div>`;
  await store.bootstrap();
  if (!location.hash) {
    location.hash = store.currentUser()
      ? (store.isAdmin() ? "#/admin" : "#/")
      : "#/login";
  }
  startRouter();
}

boot();
