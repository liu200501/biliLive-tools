import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createRecordExtraDataController } from "../src/xml_stream_controller";
import type { DouyinPk } from "../src/common";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

// 复刻 DouYinRecorder 中 client.on("pk") 的产出，
// 数据来自 2026-11-11 房间 735117146158 的真实 4 人 PK 抓包。
const OWNER_ID = "2877850313300236";
const BATTLE_ID = "7706687796802917416";

function buildScoresMessage(): DouyinPk {
  const scores = [
    { anchor_id: "2877850313300236", score: "297", battle_rank: 1 },
    { anchor_id: "4053252359854393", score: "4", battle_rank: 2 },
    { anchor_id: "7586242520251155505", score: "3", battle_rank: 3 },
    { anchor_id: "7704649873056465957", score: "0", battle_rank: 4 },
  ];
  const matchOwner = (id?: string | null) => !!id && id === OWNER_ID;
  const opponents = scores
    .filter((s) => !matchOwner(s.anchor_id))
    .map((s) => ({ anchorId: s.anchor_id, score: s.score, rank: s.battle_rank }));
  const mine = scores.find((s) => matchOwner(s.anchor_id));
  return {
    type: "douyin_pk",
    timestamp: Date.now(),
    event: "scores",
    battleId: BATTLE_ID,
    myScore: mine?.score,
    opponents,
    opponentId: opponents[0]?.anchorId,
    opponentScore: opponents[0]?.score,
  };
}

describe("douyin pk xml e2e", () => {
  it("should write real 4-player pk scores into xml", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "douyin-pk-e2e-"));
    tempDirs.push(tempDir);
    const xmlPath = path.join(tempDir, "record.xml");

    const controller = createRecordExtraDataController(xmlPath);
    controller.setMeta({ room_id: "735117146158", user_name: "七七不叭叭" });

    // start
    controller.addMessage({
      type: "douyin_pk",
      timestamp: Date.now(),
      event: "start",
      battleId: BATTLE_ID,
      duration: 300,
    });
    // scores（真实抓包）
    controller.addMessage(buildScoresMessage());
    // finish
    controller.addMessage({
      type: "douyin_pk",
      timestamp: Date.now() + 1000,
      event: "finish",
      battleId: BATTLE_ID,
      myScore: "512",
      opponents: [
        { anchorId: "4053252359854393", score: "40", rank: 2 },
        { anchorId: "7586242520251155505", score: "30", rank: 3 },
        { anchorId: "7704649873056465957", score: "10", rank: 4 },
      ],
    });

    expect(controller.getStats().pkNum).toBe(3);
    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");

    // 事件序列
    expect(content).toContain('event="start"');
    expect(content).toContain('event="scores"');
    expect(content).toContain('event="finish"');
    // 对局 ID
    expect(content).toContain(`battle_id="${BATTLE_ID}"`);
    // 我方分值
    expect(content).toContain('my_score="297"');
    expect(content).toContain('my_score="512"');
    // 多对手
    expect(content).toContain("opponents=");
    expect(content).toContain("4053252359854393:4:2");
    expect(content).toContain("7586242520251155505:3:3");
    expect(content).toContain("7704649873056465957:0:4");
    // 头部统计
    expect(content).toContain('count(/i/douyin_pk)');

    // 打印实际片段便于人工核对
    const lines = content.split("\n").filter((l) => l.includes("<douyin_pk"));
    console.log("=== 生成的 douyin_pk 节点 ===");
    for (const l of lines) console.log(l.trim());
  });
});
