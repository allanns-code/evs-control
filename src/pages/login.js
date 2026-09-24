import { store } from "../store.js";
import { navigate } from "../router.js";
import { toast } from "../utils.js";

function logoSvg() {
  return `<svg class="logo-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="position:static;width:56px;height:56px;margin:0 auto 4px;display:block">
    <rect width="64" height="64" rx="14" fill="#fff"/>
    <path d="M32 13 L53 32 L46 32 L32 20 L18 32 L11 32 Z" fill="#2B4ECC"/>
    <rect x="19" y="30" width="26" height="21" rx="2" fill="#2B4ECC"/>
    <rect x="28" y="39" width="8" height="12" rx="1.5" fill="#fff"/>
    <rect x="16" y="51" width="32" height="4" rx="2" fill="#A9C1F5"/>
    <path d="M49 8 C55 6 60 11 57 17 C54 23 47 21 47 15 C47 12 47.6 9.8 49 8 Z" fill="#3BA55D"/>
    <path d="M48 20 C49.5 16 52 13.5 56 12.5" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  </svg>`;
}

export function renderLogin(root) {
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-box">
        ${logoSvg()}
        <h1 class="login-title">EVS Control</h1>
        <p class="login-subtitle">Login</p>
        <form id="formLogin">
          <label class="login-label">Email</label>
          <input name="email" type="email" placeholder="Digite seu email" required autocomplete="username" />
          <label class="login-label">Senha</label>
          <div class="pwd-wrap">
            <input name="senha" type="password" placeholder="Digite sua senha" required autocomplete="current-password" />
            <button type="button" class="eye" id="togglePwd" aria-label="Mostrar senha">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <button type="submit" class="btn-entrar">Entrar</button>
        </form>
        <a class="login-forgot" href="#/recuperar">Esqueci minha senha</a>
        <p class="login-primeiro">Primeiro acesso?</p>
        <a class="btn-criar" href="#/cadastro">Criar conta nova</a>
        <div class="login-sep"></div>
        <button type="button" class="btn-colab" id="btnColabToggle">Login de Colaborador</button>
        <form id="formColab" class="colab-form hidden">
          <label class="login-label">Email</label>
          <input name="email" type="email" placeholder="E-mail do colaborador" />
          <label class="login-label">Senha</label>
          <input name="senha" type="password" placeholder="Senha do colaborador" />
          <button type="submit" class="btn-entrar">Entrar</button>
        </form>
      </div>
    </div>`;

  const pwd = root.querySelector('#formLogin [name="senha"]');
  const eyeBtn = root.querySelector("#togglePwd");
  eyeBtn.onclick = () => {
    pwd.type = pwd.type === "password" ? "text" : "password";
  };

  root.querySelector("#btnColabToggle").onclick = () => {
    const form = root.querySelector("#formColab");
    form.classList.toggle("hidden");
    const btn = root.querySelector("#btnColabToggle");
    btn.textContent = form.classList.contains("hidden")
      ? "Login de Colaborador"
      : "Ocultar login de colaborador";
  };

  root.querySelector("#formLogin").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type='submit']");
    btn.disabled = true;
    try {
      await store.login(fd.get("email"), fd.get("senha"));
      navigate(store.isAdmin() ? "/admin" : "/");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  };

  root.querySelector("#formColab").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await store.loginColaborador(fd.get("email"), fd.get("senha"));
      navigate("/");
    } catch (err) {
      toast(err.message, "err");
    }
  };
}

export function renderCadastro(root) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="brand-login">
        ${logoSvg()}
        <h1>EVS Control</h1>
        <p>Controle financeiro</p>
      </div>
      <div class="card" style="background:#fff8e8;border-color:#f3d29a;text-align:center">
        <strong>Experimente 21 dias gratis</strong>
        <p class="muted" style="margin:6px 0 0">Depois: R$ 7,90 por mes. Sem cartao agora.</p>
      </div>
      <div class="auth-card">
        <h2 style="margin-top:0;text-align:center">Criar conta</h2>
        <form id="formCad">
          <input name="nome" placeholder="Seu nome" required />
          <input name="email" type="email" placeholder="E-mail" required />
          <input name="senha" type="password" placeholder="Senha" required minlength="4" />
          <input name="indicado" type="email" placeholder="E-mail de quem indicou (opcional)" />
          <input name="licenca" placeholder="Codigo de licenca (opcional)" />
          <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:10px">
            <input type="checkbox" style="width:auto;margin:0" id="showPwd"> Mostrar senha
          </label>
          <button>Criar conta</button>
        </form>
        <div class="auth-links"><a href="#/login">Ja tenho conta, voltar ao login</a></div>
      </div>
    </div>`;

  root.querySelector("#showPwd").onchange = (e) => {
    root.querySelector('[name="senha"]').type = e.target.checked ? "text" : "password";
  };
  root.querySelector("#formCad").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await store.register({
        nome: fd.get("nome"),
        email: fd.get("email"),
        senha: fd.get("senha"),
        indicadoPor: fd.get("indicado") || null,
        licenca: fd.get("licenca") || null,
      });
      toast("Conta criada. Bem-vindo!");
      navigate("/");
    } catch (err) {
      toast(err.message, "err");
    }
  };
}

export function renderRecuperar(root) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="brand-login"><h1>Recuperar senha</h1><p>Informe o e-mail da conta</p></div>
      <div class="auth-card">
        <form id="formRec">
          <input name="email" type="email" placeholder="E-mail" required />
          <button>Enviar</button>
        </form>
        <div class="auth-links"><a href="#/login">Voltar ao login</a></div>
      </div>
    </div>`;
  root.querySelector("#formRec").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const nome = await store.recover(e.target.email.value);
      toast(`Ola ${nome}. Fale com o administrador para redefinir a senha.`);
    } catch (err) {
      toast(err.message, "err");
    }
  };
}
