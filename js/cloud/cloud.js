// Firebase: login e sincronização em tempo real com o Realtime Database.
//
// O app continua guardando uma cópia local (localStorage) para abrir rápido e funcionar
// sem internet. Toda alteração local vira uma atualização por item no banco; alterações
// feitas sem internet ficam numa fila (persistida) e são enviadas quando a conexão volta.

import { store } from '../store.js';
import { firebaseConfig, SDK_BASE, userDataPath, ALLOWED_EMAILS } from './config.js';
import { toPaths, diff, samePaths, fromRemote, overlay, pathsOnlyLocal, canon } from './sync.js';

const OWNER_KEY = 'pauta:owner';
const MODE_KEY = 'pauta:mode';
const pendingKey = (uid) => `pauta:pending:${uid}`;

let fb = null;
let sdkPromise = null;
const listeners = new Set();

const info = {
  status: 'off', // off | connecting | online | offline | error
  user: null,
  pending: 0,
  error: '',
};

function notify() {
  for (const fn of listeners) fn({ ...info });
}

function set(patch) {
  Object.assign(info, patch);
  notify();
}

/** Rodando no computador de desenvolvimento (localhost). */
export const isDevHost = () => ['localhost', '127.0.0.1'].includes(location.hostname);

function useEmulator() {
  return isDevHost() && new URLSearchParams(location.search).has('emulador');
}

const isAllowed = (user) => ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(String(user?.email || '').toLowerCase());

/** Carrega o SDK do Firebase sob demanda (fica em cache no service worker). */
async function sdk() {
  if (fb) return fb;
  sdkPromise = sdkPromise || (async () => {
    const [A, Auth, D] = await Promise.all([
      import(`${SDK_BASE}/firebase-app.js`),
      import(`${SDK_BASE}/firebase-auth.js`),
      import(`${SDK_BASE}/firebase-database.js`),
    ]);
    const app = A.initializeApp(firebaseConfig);
    const auth = Auth.getAuth(app);
    auth.languageCode = 'pt';
    const db = D.getDatabase(app);
    if (useEmulator()) {
      Auth.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      D.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    fb = { app, auth, db, Auth, D };
    return fb;
  })();
  try {
    return await sdkPromise;
  } catch (e) {
    sdkPromise = null;
    throw e;
  }
}

// ---------- Mensagens de erro em português ----------

const AUTH_ERRORS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/user-not-found': 'Não existe conta com este e-mail.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use “Entrar”.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Digite a senha.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de concluir.',
  'auth/cancelled-popup-request': 'Login cancelado.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.',
  'auth/operation-not-allowed': 'Este tipo de login não está ativado no Firebase (Authentication → Método de login).',
  'auth/configuration-not-found': 'O Firebase Authentication ainda não foi ativado no projeto.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).',
};

export function authErrorMessage(e) {
  if (AUTH_ERRORS[e?.code]) return AUTH_ERRORS[e.code];
  if (!e?.code && /import|fetch|network|load/i.test(String(e?.message))) return 'Sem conexão com a internet. Conecte-se e tente de novo.';
  return `Não foi possível concluir (${e?.code || e?.message || 'erro desconhecido'}).`;
}

function dbErrorMessage(e) {
  const msg = String(e?.code || e?.message || e);
  if (/permission/i.test(msg)) return 'O banco recusou o acesso. Publique as regras de segurança (database.rules.json) no Firebase.';
  return `Erro na sincronização: ${msg}`;
}

// ---------- Sincronização ----------

let session = null;

function loadPending(uid) {
  try {
    return new Set(JSON.parse(localStorage.getItem(pendingKey(uid)) || '[]'));
  } catch {
    return new Set();
  }
}

function startSession(user) {
  const { db, D } = fb;
  const dataRef = D.ref(db, userDataPath(user.uid));
  const s = {
    uid: user.uid,
    dataRef,
    pending: loadPending(user.uid),
    lastMap: toPaths(store.get()),
    firstSnapshot: true,
    unsubs: [],
  };
  const savePending = () => {
    try {
      localStorage.setItem(pendingKey(s.uid), JSON.stringify([...s.pending]));
    } catch { /* ignora */ }
    set({ pending: s.pending.size });
  };

  const push = (updates) => {
    const paths = Object.keys(updates);
    if (!paths.length) return;
    for (const p of paths) s.pending.add(p);
    savePending();
    const written = Object.fromEntries(paths.map((p) => [p, updates[p] === null ? null : JSON.stringify(canon(updates[p]))]));
    D.update(dataRef, updates).then(() => {
      if (session !== s) return;
      for (const p of paths) if ((s.lastMap.get(p) ?? null) === written[p]) s.pending.delete(p);
      savePending();
      if (info.status === 'error') set({ status: 'online', error: '' });
    }).catch((e) => {
      if (session === s) set({ status: 'error', error: dbErrorMessage(e) });
    });
  };

  const pushPaths = (paths) => {
    const local = toPaths(store.get());
    const updates = {};
    for (const p of paths) updates[p] = local.has(p) ? JSON.parse(local.get(p)) : null;
    push(updates);
  };

  // Alterações locais → nuvem
  s.unsubs.push(store.subscribe((state, meta) => {
    if (session !== s) return;
    const next = toPaths(state);
    if (meta?.remote) {
      s.lastMap = next;
      return;
    }
    const updates = diff(s.lastMap, next);
    s.lastMap = next;
    push(updates);
  }));

  // Nuvem → aparelho
  const onData = (snap) => {
    if (session !== s) return;
    const data = snap.val();
    const local = store.get();
    const localPaths = toPaths(local);
    const owner = localStorage.getItem(OWNER_KEY);

    if (s.firstSnapshot) {
      s.firstSnapshot = false;
      if (owner && owner !== s.uid) {
        // Dados de outra conta neste aparelho: descarta e usa só os da nuvem.
        s.pending.clear();
        savePending();
        store.replaceFromRemote(data ? fromRemote(data) : {});
        localStorage.setItem(OWNER_KEY, s.uid);
        return;
      }
      if (!data) {
        // Conta nova: envia tudo o que já existe neste aparelho.
        localStorage.setItem(OWNER_KEY, s.uid);
        pushPaths([...localPaths.keys()]);
        return;
      }
      if (!owner) {
        // Aparelho usado sem conta: junta os itens que só existem aqui.
        const remotePaths = toPaths(store.migrate(fromRemote(data)));
        for (const p of pathsOnlyLocal(localPaths, remotePaths)) s.pending.add(p);
        savePending();
        localStorage.setItem(OWNER_KEY, s.uid);
      }
      // Reenvia o que ficou pendente de sessões anteriores (ex.: app fechado sem internet).
      if (s.pending.size) pushPaths([...s.pending]);
    }

    const merged = overlay(store.migrate(fromRemote(data || {})), local, s.pending);
    const mergedPaths = toPaths(store.migrate(merged));
    if (samePaths(mergedPaths, localPaths)) {
      s.lastMap = localPaths;
      return;
    }
    store.replaceFromRemote(merged);
  };
  s.unsubs.push(D.onValue(dataRef, onData, (e) => {
    if (session === s) set({ status: 'error', error: dbErrorMessage(e) });
  }));

  // Estado da conexão
  s.unsubs.push(D.onValue(D.ref(db, '.info/connected'), (snap) => {
    if (session !== s || info.status === 'error') return;
    set({ status: snap.val() ? 'online' : 'offline' });
  }));

  session = s;
  set({ status: 'connecting', pending: s.pending.size, error: '' });
}

function stopSession() {
  if (!session) return;
  for (const u of session.unsubs) u();
  session = null;
}

// Alterações feitas enquanto não há sessão (abrindo o app, antes de o login carregar, ou
// sem internet) entram na fila da conta dona do aparelho, para não serem sobrescritas pela
// nuvem quando a sincronização começar.
let baseline = toPaths(store.get());
store.subscribe((state, meta) => {
  const next = toPaths(state);
  const owner = localStorage.getItem(OWNER_KEY);
  if (!session && !meta?.remote && owner && localStorage.getItem(MODE_KEY) !== 'local') {
    const changed = Object.keys(diff(baseline, next));
    if (changed.length) {
      const pending = loadPending(owner);
      for (const p of changed) pending.add(p);
      try {
        localStorage.setItem(pendingKey(owner), JSON.stringify([...pending]));
      } catch { /* ignora */ }
    }
  }
  baseline = next;
});

// ---------- API pública ----------

export const cloud = {
  get info() {
    return { ...info };
  },
  /** Uso sem conta (só no computador de desenvolvimento; o app publicado exige login). */
  get localMode() {
    return isDevHost() && localStorage.getItem(MODE_KEY) === 'local';
  },
  setLocalMode(on) {
    if (on) localStorage.setItem(MODE_KEY, 'local');
    else localStorage.removeItem(MODE_KEY);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Espera as alterações pendentes chegarem à nuvem (true) ou o tempo acabar (false). */
  waitForSync(ms = 5000) {
    if (!info.pending) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, ms);
      const off = cloud.subscribe((i) => {
        if (i.pending) return;
        clearTimeout(timer);
        off();
        resolve(true);
      });
    });
  },
  /**
   * Carrega o Firebase e acompanha o login. `onUser(user, aviso)` é chamado com o usuário
   * (ou null e um aviso opcional) sempre que o login muda. Lança erro se o SDK não puder
   * ser carregado (sem internet).
   *
   * Acesso restrito: contas fora de ALLOWED_EMAILS são desconectadas na hora, e contas de
   * e-mail/senha precisam ter o e-mail confirmado. As regras do banco aplicam o mesmo.
   */
  async init(onUser) {
    const { auth, Auth } = await sdk();
    let notice = null;
    Auth.onAuthStateChanged(auth, (user) => {
      if (user && !isAllowed(user)) {
        notice = { kind: 'error', text: `Acesso restrito. A conta ${user.email || 'usada'} não tem permissão para usar este app.` };
        stopSession();
        Auth.signOut(auth);
        return;
      }
      if (user && !user.emailVerified) {
        stopSession();
        Auth.sendEmailVerification(user)
          .then(() => { notice = { kind: 'ok', text: `Confirme seu e-mail: enviamos um link para ${user.email}. Depois de confirmar, entre de novo.` }; })
          .catch(() => { notice = { kind: 'error', text: 'Seu e-mail ainda não foi confirmado. Não foi possível enviar o link agora; tente de novo em alguns minutos.' }; })
          .finally(() => Auth.signOut(auth));
        return;
      }
      if (user) {
        set({ user: { uid: user.uid, email: user.email, name: user.displayName || '' } });
        if (!session || session.uid !== user.uid) {
          stopSession();
          startSession(user);
        }
        if (user.displayName && !store.get().profile.name) {
          store.update((s) => { s.profile.name = user.displayName; });
        }
      } else {
        stopSession();
        set({ user: null, status: 'off', pending: 0, error: '' });
        const n = notice;
        notice = null;
        onUser(null, n);
        return;
      }
      onUser(info.user);
    });
  },
  async signIn(email, password) {
    const { auth, Auth } = await sdk();
    await Auth.signInWithEmailAndPassword(auth, email, password);
  },
  async resetPassword(email) {
    const { auth, Auth } = await sdk();
    await Auth.sendPasswordResetEmail(auth, email);
  },
  async signInWithGoogle() {
    const { auth, Auth } = await sdk();
    await Auth.signInWithPopup(auth, new Auth.GoogleAuthProvider());
  },
  /** Sai da conta e limpa os dados deste aparelho (eles continuam na nuvem). */
  async signOut() {
    const { auth, Auth } = await sdk();
    const uid = info.user?.uid;
    stopSession();
    if (uid) localStorage.removeItem(pendingKey(uid));
    localStorage.removeItem(OWNER_KEY);
    store.clearLocal();
    await Auth.signOut(auth);
  },
};
