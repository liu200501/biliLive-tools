/**
 * 抖音主播档案缓存。
 *
 * PK 报文里只有对手的数字 uid，没有昵称，也没有 sec_uid，无法直接拼主页链接。
 * 这里保存两类档案：
 * 1. 运行时缓存：本机解析过的直播间（名称 + sec_uid），命中即可补全；
 * 2. 手动档案：用户在「设置 → 直播录制 → 抖音 → PK 主播档案」里登记的 uid → 名称/主页，
 *    用于补全从未在本机解析过的对手。
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

/** 运行时缓存：本机解析过的直播间 */
const profiles = new Map<string, AnchorProfile>();
/** 手动档案：用户在设置页维护 */
const manualProfiles = new Map<string, AnchorProfile>();

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

/** 查档案：运行时缓存优先，缺失字段用手动档案补齐 */
export function getAnchorProfile(uid?: string | null): AnchorProfile | undefined {
  const key = uid == null ? "" : String(uid).trim();
  if (!key) return undefined;

  const runtime = profiles.get(key);
  const manual = manualProfiles.get(key);
  if (!runtime) return manual;
  if (!manual) return runtime;

  return {
    uid: key,
    name: runtime.name || manual.name,
    secUid: runtime.secUid || manual.secUid,
    homepage: runtime.homepage || manual.homepage,
  };
}

/** 仅用于测试：清空全部档案 */
export function clearAnchorProfiles(): void {
  profiles.clear();
  manualProfiles.clear();
}
