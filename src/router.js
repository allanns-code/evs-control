const routes = {};

export function register(path, render) {
  routes[path] = render;
}

export function navigate(path) {
  if (location.hash !== `#${path}`) location.hash = path;
  else render();
}

export function currentPath() {
  const h = location.hash.replace(/^#/, "") || "/";
  return h.startsWith("/") ? h : `/${h}`;
}

export function render() {
  const app = document.getElementById("app");
  const path = currentPath();
  const fn = routes[path] || routes["/404"] || routes["/"];
  app.innerHTML = "";
  try {
    fn(app);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h2>Falha ao abrir a tela</h2><p class="muted">${String(err.message || err)}</p><a href="#/">Voltar ao painel</a></div></div>`;
  }
  window.scrollTo(0, 0);
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}
