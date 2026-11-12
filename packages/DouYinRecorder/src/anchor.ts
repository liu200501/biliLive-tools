/**
 * 抖音主播档案缓存。
 *
 * PK 报文里只有对手的数字 uid，没有昵称，也没有 sec_uid。
 * 这里按优先级保存三层档案：
 * 1. 运行时解析：本机解析过的直播间（名称 + sec_uid），最可信；
 * 2. 手动档案：设置页登记的 uid → 名称/主页，用户纠错优先于网络结果；
 * 3. 网络补全：抖音直播端用户接口查到的结果，只补空缺，不覆盖前两层。
 *
 * 网络接口未公开、随时可能失效，风险与应急处理见 ./ANCHOR_LOOKUP.md。
 */
export interface AnchorProfile {
  uid: string;
  name?: string;
  secUid?: string;
  /** 抖音主页链接，仅在拿到 sec_uid 或手动填写时才有 */
  homepage?: string;
}

/** 用户手动登记的档案 */
export interface AnchorProfileInput {
  uid?: string | null;
  name?: string;
  secUid?: string | null;
  /** 主页链接，也允许直接填 sec_uid */
  homepage?: string | null;
}

/** 运行时解析：本机解析过的直播间 */
const profiles = new Map<string, AnchorProfile>();
/** 手动档案：用户在设置页维护 */
const manualProfiles = new Map<string, AnchorProfile>();
/** 网络补全：直播端用户接口查到的结果，优先级最低 */
const networkProfiles = new Map<string, AnchorProfile>();

/** 持久化到配置的缓存条目 */
export interface AnchorProfileCacheEntry {
  name?: string;
  secUid?: string;
  homepage?: string;
}
export type AnchorProfileCache = Record<string, AnchorProfileCacheEntry>;

/** 是否允许发起在线补全请求，由设置页的开关控制 */
let lookupEnabled = true;

export function setAnchorLookupEnabled(enabled?: boolean | null): void {
  lookupEnabled = enabled !== false;
}

export function isAnchorLookupEnabled(): boolean {
  return lookupEnabled;
}

/** 启动/配置更新时把持久化的缓存灌回内存；已存在的条目不覆盖 */
export function seedAnchorProfiles(cache?: AnchorProfileCache | null): void {
  for (const [uid, entry] of Object.entries(cache ?? {})) {
    const key = uid.trim();
    if (!key || !entry || networkProfiles.has(key)) continue;
    const secUid = entry.secUid?.trim() || undefined;
    networkProfiles.set(key, {
      uid: key,
      name: entry.name?.trim() || undefined,
      secUid,
      homepage: entry.homepage?.trim() || anchorHomepage(secUid),
    });
  }
}

type AnchorProfileListener = (profile: AnchorProfile) => void;
const resolvedListeners = new Set<AnchorProfileListener>();

/** 网络查询成功时通知外部持久化；返回取消订阅函数 */
export function onAnchorProfileResolved(listener: AnchorProfileListener): () => void {
  resolvedListeners.add(listener);
  return () => {
    resolvedListeners.delete(listener);
  };
}

/** sec_uid → 抖音主页链接 */
export function anchorHomepage(secUid?: string | null): string | undefined {
  const value = secUid?.trim();
  return value ? `https://www.douyin.com/user/${value}` : undefined;
}

/**
 * 主页链接归一化：允许直接粘贴 sec_uid
 */
export function normalizeHomepage(input?: string | null): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return anchorHomepage(value);
}

/** 从主页链接里取出 sec_uid，取不到时原样返回（当作 sec_uid） */
export function parseSecUid(input?: string | null): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  const matched = value.match(/\/user\/([^/?#]+)/);
  if (matched) return matched[1];
  if (/^https?:\/\//i.test(value)) return undefined;
  return value;
}

/** 记录/更新一位主播的运行时档案，空字段不会覆盖已有值 */
export function rememberAnchor(input: {
  uid?: string | null;
  name?: string;
  secUid?: string | null;
}): AnchorProfile | undefined {
  const uid = input.uid?.trim();
  if (!uid) return undefined;

  const previous = profiles.get(uid);
  const next: AnchorProfile = {
    uid,
    name: input.name?.trim() || previous?.name,
    secUid: input.secUid?.trim() || previous?.secUid,
  };
  next.homepage = anchorHomepage(next.secUid) ?? previous?.homepage;
  profiles.set(uid, next);
  return next;
}

/**
 * 覆盖手动档案（来自设置页配置）。
 *
 * 传入空数组即清空手动档案，不影响运行时缓存。
 */
export function setAnchorProfiles(inputs?: AnchorProfileInput[] | null): void {
  manualProfiles.clear();
  for (const input of inputs ?? []) {
    if (!input) continue;
    const uid = input.uid == null ? "" : String(input.uid).trim();
    if (!uid) continue;

    const name = input.name?.trim() || undefined;
    const secUid = input.secUid?.trim() || parseSecUid(input.homepage);
    const homepage = normalizeHomepage(input.homepage) ?? anchorHomepage(secUid);
    if (!name && !homepage) continue;

    manualProfiles.set(uid, { uid, name, secUid, homepage });
  }
}

/** 查档案：本机解析 > 手动登记 > 网络补全，逐层补齐缺失字段 */
export function getAnchorProfile(uid?: string | null): AnchorProfile | undefined {
  const key = uid == null ? "" : String(uid).trim();
  if (!key) return undefined;

  const runtime = profiles.get(key);
  const manual = manualProfiles.get(key);
  const network = networkProfiles.get(key);
  if (!runtime && !manual && !network) return undefined;

  return {
    uid: key,
    name: runtime?.name || manual?.name || network?.name,
    secUid: runtime?.secUid || manual?.secUid || network?.secUid,
    homepage: runtime?.homepage || manual?.homepage || network?.homepage,
  };
}

/**
 * 抖音直播端用户接口：uid → 昵称 / sec_uid。
 *
 * 实测无需登录、无需 a_bogus/X-Bogus 签名即可访问（2026-11 验证）：
 * - 必须带 `target_uid`，否则返回 10033 forbidden；
 * - 不要带 `Referer: https://live.douyin.com/`，带上同样会 10033；
 * 这是未公开接口，随时可能失效；失效表现、排查步骤与应急方案见 ./ANCHOR_LOOKUP.md。
 * 改动这里的参数前请先读那份文档，并保留「失败静默降级」的行为。
 */
const USER_PROFILE_API = "https://live.douyin.com/webcast/user/";
const LOOKUP_TIMEOUT_MS = 4000;
/** 解析失败后的冷却时间，避免同一 uid 在一次直播里被反复请求 */
const LOOKUP_FAILURE_TTL_MS = 10 * 60 * 1000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/** 进行中的请求，同一 uid 只发一次 */
const lookupTasks = new Map<string, Promise<AnchorProfile | undefined>>();
/** uid → 最近一次失败时间 */
const lookupFailures = new Map<string, number>();

async function requestAnchorProfile(uid: string): Promise<AnchorProfile | undefined> {
  if (typeof fetch !== "function") return undefined;

  const query = new URLSearchParams({
    aid: "6383",
    app_name: "douyin_web",
    device_platform: "web",
    uid,
    target_uid: uid,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(`${USER_PROFILE_API}?${query.toString()}`, {
      headers: { "user-agent": BROWSER_UA },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;

    const payload: any = await response.json();
    if (payload?.status_code !== 0 || !payload?.data) return undefined;

    const name = typeof payload.data.nickname === "string" ? payload.data.nickname : undefined;
    const secUid = typeof payload.data.sec_uid === "string" ? payload.data.sec_uid : undefined;
    if (!name && !secUid) return undefined;

    // 只写「网络补全」层：本机解析与手动登记的名字不会被覆盖
    const resolved: AnchorProfile = {
      uid,
      name,
      secUid,
      homepage: anchorHomepage(secUid),
    };
    networkProfiles.set(uid, resolved);
    for (const listener of resolvedListeners) {
      try {
        listener(resolved);
      } catch {
        // 持久化失败不影响录制
      }
    }
    return getAnchorProfile(uid) ?? resolved;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按 uid 拉取主播档案（昵称 + sec_uid + 主页），结果写入运行时缓存。
 *
 * 命中缓存不请求；同一 uid 并发只发一次；失败后冷却 10 分钟。
 */
export function fetchAnchorProfile(uid?: string | null): Promise<AnchorProfile | undefined> {
  const key = String(uid ?? "").trim();
  if (!key) return Promise.resolve(undefined);

  const known = getAnchorProfile(key);
  // 关闭在线补全时，只用本机解析 / 手动登记 / 持久化缓存
  if (!lookupEnabled) return Promise.resolve(known);
  // 昵称和主页都齐了才算完整命中
  if (known?.name && known.homepage) return Promise.resolve(known);

  const failedAt = lookupFailures.get(key);
  if (failedAt && Date.now() - failedAt < LOOKUP_FAILURE_TTL_MS) return Promise.resolve(known);

  const pending = lookupTasks.get(key);
  if (pending) return pending;

  const task = requestAnchorProfile(key)
    .catch(() => undefined)
    .then((profile) => {
      if (profile) {
        lookupFailures.delete(key);
        return profile;
      }
      lookupFailures.set(key, Date.now());
      return getAnchorProfile(key);
    })
    .finally(() => {
      lookupTasks.delete(key);
    });

  lookupTasks.set(key, task);
  return task;
}

/** 批量补全主播档案，失败静默（返回后缓存里有多少就用多少） */
export async function resolveAnchorProfiles(uids?: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set((uids ?? []).map((uid) => String(uid ?? "").trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.all(unique.map((uid) => fetchAnchorProfile(uid)));
}

/** 仅用于测试：清空全部档案 */
export function clearAnchorProfiles(): void {
  profiles.clear();
  manualProfiles.clear();
  networkProfiles.clear();
  lookupTasks.clear();
  lookupFailures.clear();
  lookupEnabled = true;
}
