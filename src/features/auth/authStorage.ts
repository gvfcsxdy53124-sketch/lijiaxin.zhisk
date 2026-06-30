export interface AuthUser {
  id: string;
  name: string;
  account: string;
  phone: string;
  email?: string;
  avatar?: string;
  status: '在职' | '已禁用';
}

export interface AuthSession {
  userId: string;
  account: string;
  name: string;
  loginAt: string;
}

export const DEFAULT_AUTH_PASSWORD = '000000';
export const PASSWORD_RULE_TEXT = '密码必须为 6 位数字';

const AUTH_SESSION_KEY = 'knowledge-auth-session';
const AUTH_PASSWORDS_KEY = 'knowledge-auth-passwords';
const AUTH_USER_OVERRIDES_KEY = 'knowledge-auth-user-overrides';
const AUTH_REMOVED_USERS_KEY = 'knowledge-auth-removed-users';

export const DEMO_AUTH_USERS: AuthUser[] = [
  {
    id: 'U-1001',
    name: '林清予',
    account: 'lin.qingyu',
    phone: '138-0001-1001',
    email: 'lin.qingyu@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lin-qingyu',
    status: '在职'
  },
  {
    id: 'U-1002',
    name: '陈知远',
    account: 'chen.zhiyuan',
    phone: '138-0001-1002',
    email: 'chen.zhiyuan@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chen-zhiyuan',
    status: '在职'
  },
  {
    id: 'U-1003',
    name: '周曼宁',
    account: 'zhou.manning',
    phone: '138-0001-1003',
    email: 'zhou.manning@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhou-manning',
    status: '已禁用'
  },
  {
    id: 'U-1004',
    name: '王一博',
    account: 'wang.yibo',
    phone: '138-0001-1004',
    email: 'wang.yibo@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=wang-yibo',
    status: '在职'
  }
];

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

const normalizePhone = (value: string) => value.replace(/\D/g, '');

export const isValidSixDigitPassword = (value: string) => /^\d{6}$/.test(value);

export function getAuthUsers() {
  const overrides = readJson<Record<string, AuthUser>>(AUTH_USER_OVERRIDES_KEY, {});
  const removedIds = new Set(readJson<string[]>(AUTH_REMOVED_USERS_KEY, []));
  const merged = new Map<string, AuthUser>();

  DEMO_AUTH_USERS.forEach((user) => {
    if (!removedIds.has(user.id)) merged.set(user.id, {...user, ...(overrides[user.id] || {})});
  });

  Object.values(overrides).forEach((user) => {
    if (!removedIds.has(user.id)) merged.set(user.id, user);
  });

  return Array.from(merged.values());
}

export function findAuthUser(identity: string) {
  const value = identity.trim().toLowerCase();
  const phoneValue = normalizePhone(identity);
  if (!value) return undefined;

  return getAuthUsers().find((user) =>
    user.account.toLowerCase() === value || normalizePhone(user.phone) === phoneValue
  );
}

export function getUserPassword(userId: string) {
  const passwords = readJson<Record<string, string>>(AUTH_PASSWORDS_KEY, {});
  return passwords[userId] || DEFAULT_AUTH_PASSWORD;
}

export function setUserPassword(userId: string, password: string) {
  const passwords = readJson<Record<string, string>>(AUTH_PASSWORDS_KEY, {});
  writeJson(AUTH_PASSWORDS_KEY, {...passwords, [userId]: password});
}

export function upsertAuthUser(user: AuthUser) {
  const overrides = readJson<Record<string, AuthUser>>(AUTH_USER_OVERRIDES_KEY, {});
  const removedIds = readJson<string[]>(AUTH_REMOVED_USERS_KEY, []).filter((id) => id !== user.id);
  writeJson(AUTH_USER_OVERRIDES_KEY, {...overrides, [user.id]: user});
  writeJson(AUTH_REMOVED_USERS_KEY, removedIds);
}

export function removeAuthUser(userId: string) {
  const overrides = readJson<Record<string, AuthUser>>(AUTH_USER_OVERRIDES_KEY, {});
  const passwords = readJson<Record<string, string>>(AUTH_PASSWORDS_KEY, {});
  const removedIds = Array.from(new Set([...readJson<string[]>(AUTH_REMOVED_USERS_KEY, []), userId]));
  delete overrides[userId];
  delete passwords[userId];
  writeJson(AUTH_USER_OVERRIDES_KEY, overrides);
  writeJson(AUTH_PASSWORDS_KEY, passwords);
  writeJson(AUTH_REMOVED_USERS_KEY, removedIds);
}

export function getAuthSession() {
  return readJson<AuthSession | null>(AUTH_SESSION_KEY, null);
}

export function setAuthSession(user: AuthUser) {
  const session: AuthSession = {
    userId: user.id,
    account: user.account,
    name: user.name,
    loginAt: new Date().toISOString()
  };
  writeJson(AUTH_SESSION_KEY, session);
  return session;
}

export function clearAuthSession() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function isAuthenticated() {
  const session = getAuthSession();
  return Boolean(session && getAuthUsers().some((user) => user.id === session.userId && user.status === '在职'));
}
