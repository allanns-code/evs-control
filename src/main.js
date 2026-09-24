import "./styles.css";
import { register, startRouter, navigate, currentPath } from "./router.js";
import { store } from "./store.js";
import { renderLogin, renderCadastro, renderRecuperar } from "./pages/login.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderAdmin } from "./pages/admin.js";
import {
  renderPesquisa, renderPrecos, renderFechamento, renderResumo, renderGestao,
  renderPrecificador, renderInventario, renderColaboradores, renderCartelas,
  renderPlano, renderIndicar, renderSuporte, renderProspectos,
} from "./pages/pages.js";

function auth(render) {
  return (root) => {
    if (!store.currentUser()) {
      navigate("/login");
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
register("/admin", auth(renderAdmin));
register("/login", guest(renderLogin));
register("/cadastro", guest(renderCadastro));
register("/recuperar", guest(renderRecuperar));
register("/pesquisa", auth(renderPesquisa));
register("/precos", auth(renderPrecos));
register("/fechamento", auth(renderFechamento));
register("/resumo", auth(renderResumo));
register("/gestao", auth(renderGestao));
register("/precificador", auth(renderPrecificador));
register("/inventario", auth(renderInventario));
register("/colaboradores", auth(renderColaboradores));
register("/cartelas", auth(renderCartelas));
register("/plano", auth(renderPlano));
register("/indicar", auth(renderIndicar));
register("/suporte", renderSuporte);
register("/prospectos", auth(renderProspectos));
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
