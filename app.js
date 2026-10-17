(() => {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? '✕' : '☰'; });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '☰'; }));
  }
  const year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
  const login = document.getElementById('googleLogin'); if (!login) return;
  const $ = id => document.getElementById(id);
  const setStatus = (id, msg) => { if ($(id)) $(id).textContent = msg || ''; };
  const cfg = window.DINO_CONFIG;
  if (!cfg || !cfg.supabasePublishableKey || cfg.supabasePublishableKey.startsWith('PASTE_') || !window.supabase) {
    login.disabled = true;
    setStatus('authStatus', 'Setup needed: add your Supabase publishable key to config.js, then upload the updated file to GitHub.');
    return;
  }
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  let user = null, currentProfile = null;
  const prFields = ['pr_5k_seconds','pr_10k_seconds','pr_16k_seconds','pr_21k_seconds','pr_42k_seconds'];
  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toSeconds(v) {
    if (!v.trim()) return null;
    const parts = v.trim().split(':');
    if (parts.length < 2 || parts.length > 3 || !parts.every(x => /^\d+$/.test(x))) throw new Error('PRs must use MM:SS or HH:MM:SS.');
    const n = parts.map(Number);
    if (n.slice(1).some(x => x > 59)) throw new Error('Minutes/seconds must be below 60.');
    return n.reduce((total, x) => total * 60 + x, 0);
  }
  function formatSeconds(v) {
    if (v === null || v === undefined) return '';
    const h = Math.floor(v/3600), m = Math.floor((v%3600)/60), s = v%60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  }
  async function loadDirectory() {
    const { data, error } = await db.from('profiles').select('id,username,nickname,bio,avatar_url,pr_5k_seconds,pr_10k_seconds,pr_16k_seconds,pr_21k_seconds,pr_42k_seconds').order('created_at', { ascending: false }).limit(100);
    if (error) { setStatus('membersStatus', 'Unable to load Dino members: ' + error.message); return; }
    setStatus('membersStatus', data.length ? `${data.length} Dino member${data.length === 1 ? '' : 's'} in the pack` : 'Be the first to create your Dino profile!');
    $('memberDirectory').innerHTML = data.map(p => `<article class="member-card">${p.avatar_url ? `<img class="member-avatar" src="${escapeHTML(p.avatar_url)}" alt="${escapeHTML(p.nickname)} profile photo" loading="lazy">` : '<div class="avatar-fallback">🦖</div>'}<h3>${escapeHTML(p.nickname)}</h3><div class="handle">@${escapeHTML(p.username)}</div><p>${escapeHTML(p.bio)}</p><div class="member-prs">${[['5K','pr_5k_seconds'],['10K','pr_10k_seconds'],['16K','pr_16k_seconds'],['21K','pr_21k_seconds'],['42K','pr_42k_seconds']].filter(([label,k])=>p[k]!=null).map(([label,k])=>`<span>${label} · ${formatSeconds(p[k])}</span>`).join('')}</div></article>`).join('');
  }
  function fillProfile(p) {
    const f = $('profileForm');
    f.elements.username.value = p?.username || '';
    f.elements.nickname.value = p?.nickname || user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    f.elements.bio.value = p?.bio || '';
    prFields.forEach(k => { f.elements[k].value = formatSeconds(p?.[k]); });
  }
  async function syncUser() {
    const { data: { user: u }, error } = await db.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') setStatus('authStatus', error.message);
    user = u || null;
    login.classList.toggle('hidden', !!user);
    $('logoutBtn').classList.toggle('hidden', !user);
    $('profileArea').classList.toggle('hidden', !user);
    if ($('navAuth')) $('navAuth').textContent = user ? 'My Profile ↗' : 'Login ↗';
    if (!user) { currentProfile = null; setStatus('authStatus','Sign in to join the pack.'); return; }
    setStatus('authStatus', 'Signed in! Set up or edit your public Dino profile below.');
    const { data, error: e } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (e) { setStatus('profileStatus', 'Could not load profile: ' + e.message); return; }
    currentProfile = data;
    if (!data) {
      const nickname = user.user_metadata?.full_name || user.user_metadata?.name || 'New Dino';
      const suggested = ('dino_' + user.id.replace(/-/g,'').slice(0,12));
      const { error: createErr } = await db.from('profiles').insert({ id: user.id, username: suggested, nickname, bio: '' });
      if (createErr) setStatus('profileStatus', 'Automatic profile setup needs attention: ' + createErr.message);
      else {
        const res = await db.from('profiles').select('*').eq('id', user.id).single();
        currentProfile = res.data;
        setStatus('profileStatus','Welcome to the pack! Customize your new profile.');
        await loadDirectory();
      }
    }
    fillProfile(currentProfile);
  }
  login.addEventListener('click', async () => {
    login.disabled = true;
    setStatus('authStatus','Opening Google sign-in...');
    const { error } = await db.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin + '/index.html#login' } });
    if (error) { setStatus('authStatus',error.message); login.disabled = false; }
  });
  $('logoutBtn').addEventListener('click', async () => { const { error } = await db.auth.signOut(); if (error) setStatus('authStatus',error.message); else { await syncUser(); await loadDirectory(); } });
  $('profileForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!user) return;
    const btn = $('saveProfile'); btn.disabled = true;
    try {
      const f = e.currentTarget;
      const username = f.elements.username.value.trim().toLowerCase();
      const nickname = f.elements.nickname.value.trim();
      if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Username must be 3–24 letters, numbers or underscores.');
      if (!nickname) throw new Error('Nickname is required.');
      const payload = { id:user.id, username, nickname, bio:f.elements.bio.value.trim() };
      prFields.forEach(k => { payload[k] = toSeconds(f.elements[k].value); });
      const file = $('avatarFile').files[0];
      if (file) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2*1024*1024) throw new Error('Choose a JPG, PNG, or WebP under 2 MB.');
        const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadErr } = await db.storage.from('avatars').upload(path, file, { contentType:file.type, upsert:false });
        if (uploadErr) throw new Error('Photo upload: ' + uploadErr.message + '. Check avatars storage setup.');
        payload.avatar_url = db.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await db.from('profiles').upsert(payload, { onConflict:'id' });
      if (error) throw error;
      currentProfile = payload;
      setStatus('profileStatus','Profile saved! Welcome to the pack.');
      await loadDirectory();
    } catch (err) { setStatus('profileStatus', err.code === '23505' ? 'That username is taken. Please choose another.' : err.message); }
    finally { btn.disabled = false; }
  });
  $('deleteProfile').addEventListener('click', async () => {
    if (!user || !confirm('Delete your PUBLIC Dino profile? This does not delete your login account.')) return;
    const { error } = await db.from('profiles').delete().eq('id',user.id);
    if (error) setStatus('profileStatus',error.message);
    else { currentProfile = null; fillProfile(null); setStatus('profileStatus','Public profile deleted. Signing in again will recreate it.'); await loadDirectory(); }
  });
  db.auth.onAuthStateChange(() => { setTimeout(() => { syncUser().catch(e => setStatus('authStatus',e.message)); },0); });
  loadDirectory(); syncUser();
})();
