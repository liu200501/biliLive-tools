/**
 * 抖音 PK 战报（`*.pk.md`）解析工具。
 *
 * 战报「最终比分」表格里未识别的主播长这样：
 *   | 2 | 对手1 · `255534739757709` | 7.5万 | ██████░░░░ 57% |
 *   | 1 | [七七不叭叭](https://www.douyin.com/user/xxx) · `92688084797` | 13.1万 | ... |
 *
 * 这里只关心反引号里的数字 uid，用来在设置页批量生成「待命名主播」。
 */
import fs from "node:fs/promises";
import path from "node:path";

export interface PkReportAnchorHit {
  uid: string;
  /** 出现在多少份战报里 */
  reports: number;
  /** 最近一次出现的时间戳（ms） */
  lastSeen?: number;
}

export interface PkReportScanResult {
  anchors: PkReportAnchorHit[];
  /** 实际扫描的战报数量 */
  scannedFiles: number;
  /** 无法扫描时的原因（目录不存在等） */
  reason?: string;
}

export interface ScanPkReportOptions {
  /** 只扫描最近多少天，默认 7 天 */
  days?: number;
  /** 最多读取多少份战报，默认 500 */
  maxFiles?: number;
  /** 最大目录深度，默认 8 */
  maxDepth?: number;
  /** 当前时间戳，便于测试 */
  now?: number;
}

const REPORT_SUFFIX = ".pk.md";

/** 从单份战报 Markdown 中提取「最终比分」里的主播 uid */
export function parsePkReportAnchors(content: string): string[] {
  const uids = new Set<string>();
  let inScoreSection = false;

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("### ")) {
      // 只认「最终比分」表格，避免把助力榜里的观众 uid 也算进来
      inScoreSection = line.includes("最终比分");
      continue;
    }
    if (line.startsWith("## ") || line.trim() === "---") {
      inScoreSection = false;
      continue;
    }
    if (!inScoreSection || !line.startsWith("|")) continue;

    for (const matched of line.matchAll(/`(\d{6,})`/g)) {
      uids.add(matched[1]);
    }
  }

  return [...uids];
}

/** 聚合多份战报，得到 uid → 出现场次 / 最近出现时间 */
export function aggregatePkReportAnchors(
  reports: { content: string; mtime?: number }[],
): PkReportAnchorHit[] {
  const map = new Map<string, PkReportAnchorHit>();
  for (const report of reports) {
    for (const uid of parsePkReportAnchors(report.content)) {
      const hit = map.get(uid) ?? { uid, reports: 0 };
      hit.reports += 1;
      if (report.mtime && (!hit.lastSeen || report.mtime > hit.lastSeen)) {
        hit.lastSeen = report.mtime;
      }
      map.set(uid, hit);
    }
  }
  return [...map.values()].sort(
    (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || b.reports - a.reports,
  );
}

interface ReportFile {
  file: string;
  mtime: number;
  size: number;
}

/** 递归查找最近 days 天的战报文件（按 mtime 倒序） */
async function findReportFiles(
  root: string,
  {
    days = 7,
    maxFiles = 500,
    maxDepth = 8,
    now = Date.now(),
  }: Pick<ScanPkReportOptions, "days" | "maxFiles" | "maxDepth" | "now">,
): Promise<ReportFile[]> {
  const since = now - Math.max(days, 1) * 24 * 60 * 60 * 1000;
  const found: ReportFile[] = [];
  let visited = 0;
  const MAX_VISITED = 20000;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth || visited > MAX_VISITED) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (visited++ > MAX_VISITED) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(REPORT_SUFFIX)) continue;

      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < since) continue;
        // 战报通常只有几十 KB，超大文件直接跳过，避免异常文件拖慢扫描
        if (stat.size > 5 * 1024 * 1024) continue;
        found.push({ file: full, mtime: stat.mtimeMs, size: stat.size });
      } catch {
        continue;
      }
    }
  };

  await walk(root, 0);
  found.sort((a, b) => b.mtime - a.mtime);
  return found.slice(0, maxFiles);
}

/**
 * 扫描录制目录下最近 N 天的 PK 战报，聚合出出现过的对手 uid。
 *
 * 不做过期清理，调用方负责按需过滤已知档案。
 */
export async function scanPkReportAnchors(
  root: string | undefined | null,
  options: ScanPkReportOptions = {},
): Promise<PkReportScanResult> {
  const savePath = root?.trim();
  if (!savePath) {
    return { anchors: [], scannedFiles: 0, reason: "未配置录制保存目录" };
  }

  try {
    const stat = await fs.stat(savePath);
    if (!stat.isDirectory()) {
      return { anchors: [], scannedFiles: 0, reason: "录制保存目录不可用" };
    }
  } catch {
    return { anchors: [], scannedFiles: 0, reason: "录制保存目录不存在" };
  }

  const files = await findReportFiles(savePath, options);
  const reports: { content: string; mtime: number }[] = [];
  for (const item of files) {
    try {
      reports.push({ content: await fs.readFile(item.file, "utf-8"), mtime: item.mtime });
    } catch {
      continue;
    }
  }

  return {
    anchors: aggregatePkReportAnchors(reports),
    scannedFiles: reports.length,
  };
}
