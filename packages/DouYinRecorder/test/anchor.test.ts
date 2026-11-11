import { beforeEach, describe, expect, it } from "vitest";

import {
  anchorHomepage,
  clearAnchorProfiles,
  getAnchorProfile,
  normalizeHomepage,
  parseSecUid,
  rememberAnchor,
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
