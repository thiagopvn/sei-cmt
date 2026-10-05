// Lógica pura de sincronização com o Realtime Database (sem dependência do Firebase).
//
// No banco, cada usuário guarda:
//   users/{uid}/data/tasks/{id}, events/{id}, services/{id}, … (um nó por item)
//   users/{uid}/data/profile, settings, areas, types, timer (nós únicos)
// Assim, edições em itens diferentes feitas em aparelhos diferentes não se sobrescrevem.

export const COLLECTIONS = ['tasks', 'events', 'services', 'swaps', 'colleagues', 'entries', 'cards', 'timeLog'];
export const SINGLES = ['profile', 'settings', 'areas', 'types', 'timer'];

/**
 * Forma canônica de um valor, igual à que o Realtime Database devolve:
 * sem null/undefined, sem objetos/listas vazios e com as chaves ordenadas.
 * Retorna undefined quando o valor "some" no banco.
 */
export function canon(v) {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return undefined;
  if (Array.isArray(v)) {
    const out = v.map(canon).filter((x) => x !== undefined);
    return out.length ? out : undefined;
  }
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const c = canon(v[k]);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

const str = (v) => {
  const c = canon(v);
  return c === undefined ? null : JSON.stringify(c);
};

/** Map<caminho, JSON canônico> com tudo que é sincronizado. */
export function toPaths(state) {
  const out = new Map();
  for (const k of COLLECTIONS) {
    for (const item of state[k] || []) {
      if (!item?.id) continue;
      const s = str(item);
      if (s !== null) out.set(`${k}/${item.id}`, s);
    }
  }
  for (const k of SINGLES) {
    const s = str(state[k]);
    if (s !== null) out.set(k, s);
  }
  return out;
}

/** Atualizações (caminho → valor | null) para levar `prev` até `next`. */
export function diff(prev, next) {
  const updates = {};
  for (const [p, s] of next) if (prev.get(p) !== s) updates[p] = JSON.parse(s);
  for (const p of prev.keys()) if (!next.has(p)) updates[p] = null;
  return updates;
}

export const samePaths = (a, b) => a.size === b.size && [...a].every(([p, s]) => b.get(p) === s);

const created = (x) => x.createdAt || x.start || x.date || '';

/** Converte o nó do banco em um estado (ainda não normalizado; passe por migrate). */
export function fromRemote(data) {
  const s = {};
  for (const k of SINGLES) if (data?.[k] !== undefined) s[k] = data[k];
  for (const k of COLLECTIONS) {
    s[k] = Object.values(data?.[k] || {}).filter((x) => x && typeof x === 'object')
      .sort((a, b) => created(a).localeCompare(created(b)) || String(a.id).localeCompare(String(b.id)));
  }
  if (s.timer === undefined) s.timer = null;
  return s;
}

/** Valor local de um caminho (para preservar alterações ainda não enviadas). */
export function valueAt(state, path) {
  const [k, id] = path.split('/');
  if (!id) return state[k] ?? null;
  return (state[k] || []).find((x) => x.id === id) || null;
}

/** Aplica em `base` o valor local de cada caminho em `paths` (muta e devolve `base`). */
export function overlay(base, local, paths) {
  for (const p of paths) {
    const [k, id] = p.split('/');
    const v = valueAt(local, p);
    if (!id) {
      base[k] = v;
      continue;
    }
    const list = (base[k] || []).filter((x) => x.id !== id);
    if (v) list.push(v);
    base[k] = list;
  }
  return base;
}

/**
 * Primeira sincronização de um aparelho que já tinha dados sem conta:
 * mantém o que está na nuvem e acrescenta os itens que só existem aqui.
 * Devolve os caminhos locais que precisam ser enviados.
 */
export function pathsOnlyLocal(localPaths, remotePaths) {
  const out = [];
  for (const p of localPaths.keys()) {
    const isItem = p.includes('/');
    if (isItem ? !remotePaths.has(p) : !remotePaths.has(p) && p !== 'timer') out.push(p);
  }
  return out;
}
