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
  fn(app);
  window.scrollTo(0, 0);
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}
