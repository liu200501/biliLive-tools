import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  anchorHomepage,
  clearAnchorProfiles,
  fetchAnchorProfile,
  getAnchorProfile,
  isAnchorLookupEnabled,
  normalizeHomepage,
  onAnchorProfileResolved,
  parseSecUid,
  rememberAnchor,
  resolveAnchorProfiles,
  seedAnchorProfiles,
  setAnchorLookupEnabled,
  setAnchorProfiles,
} from "../src/anchor";

describe("anchor profile cache", () => {
  beforeEach(() => {
    clearAnchorProfiles();
  });

  it("builds homepage from sec_uid", () => {
    expect(anchorHomepage("MS4wLjABAAAA")).toBe("https://www.douyin.com/user/MS4wLjABAAAA");
    expect(anchorHomepage("")).toBeUndefined();
    expect(anchorHomepage(undefined)).toBeUndefined();
  });

  it("remembers name and homepage and keeps previous values", () => {
    rememberAnchor({ uid: "123", name: "天绮一也", secUid: "sec-1" });
    expect(getAnchorProfile("123")).toEqual({
      uid: "123",
      name: "天绮一也",
      secUid: "sec-1",
      homepage: "https://www.douyin.com/user/sec-1",
    });

    // 空字段不应覆盖已有值
    rememberAnchor({ uid: "123", name: "", secUid: null });
    expect(getAnchorProfile("123")?.name).toBe("天绮一也");
    expect(getAnchorProfile("123")?.homepage).toBe("https://www.douyin.com/user/sec-1");
  });

  it("returns undefined for unknown uid", () => {
    expect(getAnchorProfile("999")).toBeUndefined();
    expect(getAnchorProfile(undefined)).toBeUndefined();
    expect(rememberAnchor({ uid: "" })).toBeUndefined();
  });

  it("normalizes homepage input and extracts sec_uid", () => {
    expect(normalizeHomepage("MS4wLjABAAAA")).toBe("https://www.douyin.com/user/MS4wLjABAAAA");
    expect(normalizeHomepage("https://www.douyin.com/user/abc")).toBe(
      "https://www.douyin.com/user/abc",
    );
    expect(normalizeHomepage("")).toBeUndefined();
    expect(parseSecUid("https://www.douyin.com/user/abc?from=1")).toBe("abc");
    expect(parseSecUid("MS4wLjABAAAA")).toBe("MS4wLjABAAAA");
    expect(parseSecUid("https://www.douyin.com/")).toBeUndefined();
  });

  it("uses manual profiles when the anchor was never parsed locally", () => {
    setAnchorProfiles([{ uid: "92688084797", name: "七七不叭叭", homepage: "MS4wLjABAAAAszut" }]);

    expect(getAnchorProfile("92688084797")).toEqual({
      uid: "92688084797",
      name: "七七不叭叭",
      secUid: "MS4wLjABAAAAszut",
      homepage: "https://www.douyin.com/user/MS4wLjABAAAAszut",
    });
  });

  it("runtime profile wins and manual profile fills missing fields", () => {
    // 运行时只解析到昵称，没有 sec_uid
    rememberAnchor({ uid: "111", name: "本地解析到的名字" });
    setAnchorProfiles([{ uid: "111", name: "手动名字", homepage: "sec-x" }]);

    const profile = getAnchorProfile("111");
    expect(profile?.name).toBe("本地解析到的名字");
    expect(profile?.homepage).toBe("https://www.douyin.com/user/sec-x");
  });

  it("replaces manual profiles instead of merging", () => {
    setAnchorProfiles([
      { uid: "1", name: "A" },
      { uid: "2", name: "B" },
    ]);
    expect(getAnchorProfile("1")?.name).toBe("A");

    setAnchorProfiles([{ uid: "2", name: "B2" }]);
    expect(getAnchorProfile("1")).toBeUndefined();
    expect(getAnchorProfile("2")?.name).toBe("B2");

    setAnchorProfiles([]);
    expect(getAnchorProfile("2")).toBeUndefined();
  });

  it("ignores manual entries without uid or without any useful field", () => {
    setAnchorProfiles([
      { uid: "", name: "无 uid" },
      { uid: "333" },
      { uid: "444", name: "只有名字" },
    ]);
    expect(getAnchorProfile("")).toBeUndefined();
    expect(getAnchorProfile("333")).toBeUndefined();
    expect(getAnchorProfile("444")?.name).toBe("只有名字");
  });
});

describe("fetchAnchorProfile", () => {
  const originalFetch = globalThis.fetch;
  const unsubscribes: Array<() => void> = [];

  const jsonResponse = (body: unknown, ok = true) =>
    ({
      ok,
      json: async () => body,
    }) as unknown as Response;

  const success = (nickname: string, secUid: string) =>
    jsonResponse({ status_code: 0, data: { nickname, sec_uid: secUid } });

  beforeEach(() => {
    clearAnchorProfiles();
  });

  afterEach(() => {
    while (unsubscribes.length) unsubscribes.pop()?.();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves nickname and sec_uid from the live user api", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 0,
        data: {
          nickname: "与舟渡（11.15生日版）",
          sec_uid: "MS4wLjABAAAA8dqMgP",
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const profile = await fetchAnchorProfile("1222256387166987");

    expect(profile).toEqual({
      uid: "1222256387166987",
      name: "与舟渡（11.15生日版）",
      secUid: "MS4wLjABAAAA8dqMgP",
      homepage: "https://www.douyin.com/user/MS4wLjABAAAA8dqMgP",
    });
    // 结果进入运行时缓存
    expect(getAnchorProfile("1222256387166987")?.name).toBe("与舟渡（11.15生日版）");

    const url = fetchMock.mock.calls[0]?.[0] as unknown as string;
    expect(url).toContain("uid=1222256387166987");
    expect(url).toContain("target_uid=1222256387166987");
  });

  it("does not request again once cached", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status_code: 0, data: { nickname: "A", sec_uid: "sec-a" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchAnchorProfile("1");
    await fetchAnchorProfile("1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent lookups for the same uid", async () => {
    const fetchMock = vi.fn(
      async () =>
        jsonResponse({ status_code: 0, data: { nickname: "B", sec_uid: "sec-b" } }) as Response,
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [first, second] = await Promise.all([fetchAnchorProfile("2"), fetchAnchorProfile("2")]);
    expect(first?.name).toBe("B");
    expect(second?.name).toBe("B");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns undefined and backs off when the api fails", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 10033, data: null }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await fetchAnchorProfile("3")).toBeUndefined();
    // 冷却期内不再请求
    expect(await fetchAnchorProfile("3")).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps manual profile as fallback when the api returns nothing", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ status_code: 20001, data: null }),
    ) as unknown as typeof fetch;
    setAnchorProfiles([{ uid: "4", name: "手动名字" }]);

    expect((await fetchAnchorProfile("4"))?.name).toBe("手动名字");
  });

  it("resolveAnchorProfiles looks up every uid once", async () => {
    const fetchMock = vi.fn(async (input: any) =>
      jsonResponse({
        status_code: 0,
        data: { nickname: `nick-${String(input).match(/uid=(\d+)/)?.[1]}`, sec_uid: "sec" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await resolveAnchorProfiles(["10", "11", "10", null, undefined]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAnchorProfile("10")?.name).toBe("nick-10");
    expect(getAnchorProfile("11")?.name).toBe("nick-11");
  });

  it("网络结果只补空缺，不覆盖手动登记或本机解析的昵称", async () => {
    globalThis.fetch = vi.fn(async () => success("平台昵称", "sec-net")) as unknown as typeof fetch;
    setAnchorProfiles([{ uid: "5", name: "我改过的名字" }]);
    rememberAnchor({ uid: "6", name: "本机解析的名字" });

    const manual = await fetchAnchorProfile("5");
    expect(manual?.name).toBe("我改过的名字");
    expect(manual?.homepage).toBe("https://www.douyin.com/user/sec-net");

    const runtime = await fetchAnchorProfile("6");
    expect(runtime?.name).toBe("本机解析的名字");

    // 手动档案移除后才回落到网络结果
    setAnchorProfiles([]);
    expect(getAnchorProfile("5")?.name).toBe("平台昵称");
  });

  it("关闭在线补全后不再发请求", async () => {
    const fetchMock = vi.fn(async () => success("网络名字", "sec"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setAnchorLookupEnabled(false);

    expect(isAnchorLookupEnabled()).toBe(false);
    expect(await fetchAnchorProfile("7")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    // 手动档案仍然可用
    setAnchorProfiles([{ uid: "7", name: "手动名字" }]);
    expect((await fetchAnchorProfile("7"))?.name).toBe("手动名字");
  });

  it("持久化缓存命中后不再请求", async () => {
    const fetchMock = vi.fn(async () => success("网络名字", "sec-fresh"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedAnchorProfiles({ "8": { name: "缓存名字", secUid: "sec-cache" } });

    const profile = await fetchAnchorProfile("8");
    expect(profile?.name).toBe("缓存名字");
    expect(profile?.homepage).toBe("https://www.douyin.com/user/sec-cache");
    expect(fetchMock).not.toHaveBeenCalled();

    // 重复 seed 不覆盖内存里已有的结果
    seedAnchorProfiles({ "8": { name: "旧缓存", secUid: "sec-old" } });
    expect(getAnchorProfile("8")?.name).toBe("缓存名字");
  });

  it("查询成功时通知外部持久化", async () => {
    globalThis.fetch = vi.fn(async () => success("新主播", "sec-new")) as unknown as typeof fetch;
    const seen: { uid: string; name?: string; secUid?: string }[] = [];
    unsubscribes.push(
      onAnchorProfileResolved((profile) => {
        seen.push({ uid: profile.uid, name: profile.name, secUid: profile.secUid });
      }),
    );

    await fetchAnchorProfile("9");

    expect(seen).toEqual([{ uid: "9", name: "新主播", secUid: "sec-new" }]);
  });
});
