/* ============================================================
   DialFactory V1 · Login Screen
   R1: authenticated-only access — gate the app behind Supabase Auth.
   ============================================================ */

const Login = (() => {

  function render() {
    const container = document.getElementById('page-container');
    const nav = document.getElementById('nav-container');
    if (nav) nav.innerHTML = '';
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:380px;margin:10vh auto 0;">
        <div class="card" style="padding:var(--space-xl);">
          <div style="text-align:center;margin-bottom:var(--space-lg);">
            <div style="font-size:2rem;">🏭</div>
            <h1 style="font-size:1.25rem;margin:var(--space-sm) 0 0;">DialFactory 生产追踪</h1>
            <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-top:var(--space-xs);">请登录后继续</p>
          </div>
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input type="email" id="login-email" class="form-input" placeholder="you@factory.com" autocomplete="username">
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="login-password" class="form-input" placeholder="••••••••" autocomplete="current-password">
          </div>
          <div id="login-error" style="color:var(--color-danger);font-size:var(--font-size-sm);min-height:1.2em;margin-bottom:var(--space-sm);"></div>
          <button class="btn btn-primary" id="login-btn" style="width:100%;">登录</button>
        </div>
      </div>
    `;

    const btn = document.getElementById('login-btn');
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');

    async function submit() {
      const email = emailEl.value.trim();
      const password = passEl.value;
      if (!email || !password) {
        errEl.textContent = '请输入邮箱和密码';
        return;
      }
      btn.disabled = true;
      btn.textContent = '登录中...';
      errEl.textContent = '';
      const { error } = await DB.signIn(email, password);
      if (error) {
        errEl.textContent = error.message || '登录失败';
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }
      // Success — re-init the app (session now present)
      App.init();
    }

    btn.addEventListener('click', submit);
    passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') passEl.focus(); });
  }

  return { render };
})();
