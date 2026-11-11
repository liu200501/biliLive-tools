import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aggregatePkReportAnchors,
  parsePkReportAnchors,
  scanPkReportAnchors,
} from "../../src/recorder/pkReport.js";

const REPORT = `# 抖音 PK 战报 · 天绮一也

## 第 1 局

### 最终比分

| 名次 | 主播 | PK 值 | 相对最高 |
| ---: | --- | ---: | --- |
| 1 | [七七不叭叭](https://www.douyin.com/user/MS4wLjABAAAA) · \`92688084797\` | 13.1万 | ██████████ 100% |
| 2 | 对手1 · \`255534739757709\` | 7.5万 | █████░░░░░ 57% |
| 4 | **[天绮一也](https://www.douyin.com/user/MS4wLjABAAAA)** | 2,564 | █░░░░░░░░░ 2% |

### 助力榜（快照）

| 主播 | 名次 | 用户 | 用户 ID | 分值 |
| --- | ---: | --- | --- | ---: |
| 天绮一也 | 1 | 秋年 | 224752241223095 | 1,200 |
`;

describe("pkReport 解析", () => {
  it("只提取最终比分里的主播 uid，忽略助力榜的观众 uid", () => {
    expect(parsePkReportAnchors(REPORT)).toEqual(["92688084797", "255534739757709"]);
  });

  it("没有 uid 或内容为空时返回空数组", () => {
    expect(parsePkReportAnchors("")).toEqual([]);
    expect(parsePkReportAnchors("# 空战报\n\n没有表格")).toEqual([]);
  });

  it("兼容只有 uid、没有昵称的战报行", () => {
    const content = `### 最终比分

| 名次 | 主播 | PK 值 | 相对最高 |
| ---: | --- | ---: | --- |
| 1 | \`92688084797\` | 131,391 | ████ 100% |
`;
    expect(parsePkReportAnchors(content)).toEqual(["92688084797"]);
  });

  it("聚合多份战报，统计出现场次与最近时间", () => {
    const anchors = aggregatePkReportAnchors([
      { content: REPORT, mtime: 1000 },
      {
        content: "### 最终比分\n\n| 1 | 对手1 · \`255534739757709\` | 1 | █ |",
        mtime: 2000,
      },
    ]);

    expect(anchors).toEqual([
      { uid: "255534739757709", reports: 2, lastSeen: 2000 },
      { uid: "92688084797", reports: 1, lastSeen: 1000 },
    ]);
  });
});

describe("扫描战报目录", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "pk-report-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("只扫描最近 N 天的 .pk.md，并跳过其它文件", async () => {
    const recent = path.join(root, "抖音", "主播A");
    const old = path.join(root, "抖音", "主播B");
    await fs.mkdir(recent, { recursive: true });
    await fs.mkdir(old, { recursive: true });

    await fs.writeFile(path.join(recent, "a.pk.md"), REPORT, "utf-8");
    await fs.writeFile(path.join(recent, "a.xml"), "<i/>", "utf-8");
    await fs.writeFile(path.join(old, "b.pk.md"), REPORT, "utf-8");

    const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await fs.utimes(path.join(old, "b.pk.md"), oldTime, oldTime);

    const result = await scanPkReportAnchors(root, { days: 7 });
    expect(result.scannedFiles).toBe(1);
    expect(result.anchors.map((item) => item.uid).sort()).toEqual([
      "255534739757709",
      "92688084797",
    ]);
  });

  it("目录不存在时返回原因而不是抛错", async () => {
    const result = await scanPkReportAnchors(path.join(root, "not-exists"));
    expect(result.anchors).toEqual([]);
    expect(result.reason).toBeTruthy();
  });

  it("未配置保存目录时直接返回原因", async () => {
    const result = await scanPkReportAnchors("");
    expect(result.reason).toBe("未配置录制保存目录");
  });

  it("按 maxFiles 限制读取数量", async () => {
    for (let index = 0; index < 5; index++) {
      await fs.writeFile(path.join(root, `r${index}.pk.md`), REPORT, "utf-8");
    }
    const result = await scanPkReportAnchors(root, { days: 7, maxFiles: 3 });
    expect(result.scannedFiles).toBe(3);
  });
});
