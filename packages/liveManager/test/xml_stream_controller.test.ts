import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createRecordExtraDataController } from "../src/xml_stream_controller";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("createRecordExtraDataController", () => {
  it("should aggregate danma count and 10-second buckets from comment messages", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const controller = createRecordExtraDataController(path.join(tempDir, "record.xml"));
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "comment",
      timestamp: startTimestamp,
      text: "first",
      sender: { name: "u1", uid: "1" },
    });
    controller.addMessage({
      type: "comment",
      timestamp: startTimestamp + 9_999,
      text: "second",
      sender: { name: "u2", uid: "2" },
    });
    controller.addMessage({
      type: "comment",
      timestamp: startTimestamp + 10_000,
      text: "third",
      sender: { name: "u1", uid: "1" },
    });
    controller.addMessage({
      type: "comment",
      timestamp: startTimestamp + 22_000,
      text: "fourth",
      sender: { name: "u3", uid: "3" },
    });

    expect(controller.getStats()).toEqual({
      danmaNum: 4,
      uniqMember: 3,
      scNum: 0,
      guardNum: 0,
      pkNum: 0,
      danmaStats: {
        danmaTimeline: {
          interval: 10,
          data: [2, 1, 1],
        },
      },
    });

    await controller.flush();
  });

  it("should write pk_status messages into xml as pk nodes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "pk_status",
      timestamp: startTimestamp,
      status: 0,
    });
    controller.addMessage({
      type: "pk_status",
      timestamp: startTimestamp + 5_000,
      status: 1,
    });

    expect(controller.getStats().pkNum).toBe(2);

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain("<pk");
    expect(content).toContain('status="0"');
    expect(content).toContain('status="1"');
  });

  it("should not write pk nodes when there is no pk_status message", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);

    controller.addMessage({
      type: "comment",
      timestamp: controller.data.meta.recordStartTimestamp,
      text: "hello",
      sender: { name: "u1", uid: "1" },
    });

    expect(controller.getStats().pkNum).toBe(0);

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).not.toContain("<pk");
  });

  it("should compute ts relative to record start for pk nodes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "pk_status",
      timestamp: startTimestamp + 5_000,
      status: 1,
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain('ts="5"');
    expect(content).toContain(`timestamp="${startTimestamp + 5_000}"`);
  });

  it("should write opponent attribute for pk nodes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "pk_status",
      timestamp: startTimestamp,
      status: 1,
      opponent: { name: "对手A", uid: "999" },
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain('opponent="对手A"');
  });

  it("should fall back to empty opponent attribute when it is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "pk_status",
      timestamp: startTimestamp,
      status: 1,
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain('opponent=""');
  });

  it("should write both danma and pk nodes when messages are mixed", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "comment",
      timestamp: startTimestamp,
      text: "first",
      sender: { name: "u1", uid: "1" },
    });
    controller.addMessage({
      type: "pk_status",
      timestamp: startTimestamp + 1_000,
      status: 1,
    });
    controller.addMessage({
      type: "comment",
      timestamp: startTimestamp + 2_000,
      text: "second",
      sender: { name: "u2", uid: "2" },
    });

    const stats = controller.getStats();
    expect(stats.danmaNum).toBe(2);
    expect(stats.pkNum).toBe(1);

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain("<d ");
    expect(content).toContain("first");
    expect(content).toContain("second");
    expect(content).toContain("<pk");
    expect(content).toContain('status="1"');
    // XML 头部通过 XSL 模板统计 PK 记录数
    expect(content).toContain('href="#pk"');
    expect(content).toContain("count(/i/pk)");
  });

  it("should write douyin_pk events into xml with my/opponent scores", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const startTimestamp = controller.data.meta.recordStartTimestamp;

    controller.addMessage({
      type: "douyin_pk",
      timestamp: startTimestamp + 1_000,
      event: "start",
      battleId: "battle-1",
      duration: 300,
    });
    controller.addMessage({
      type: "douyin_pk",
      timestamp: startTimestamp + 30_000,
      event: "scores",
      battleId: "battle-1",
      myScore: "218",
      opponentScore: "211",
      opponentId: "999",
    });
    controller.addMessage({
      type: "douyin_pk",
      timestamp: startTimestamp + 200_000,
      event: "finish",
      battleId: "battle-1",
      myScore: "5000",
      opponentScore: "4800",
      opponentId: "999",
      opponentArmies: [{ uid: "1", nickname: "粉丝A", score: "100" }],
    });

    expect(controller.getStats().pkNum).toBe(3);

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain("<douyin_pk");
    expect(content).toContain('event="start"');
    expect(content).toContain('event="scores"');
    expect(content).toContain('event="finish"');
    expect(content).toContain('battle_id="battle-1"');
    expect(content).toContain('duration="300"');
    expect(content).toContain('my_score="218"');
    expect(content).toContain('opponent_score="211"');
    expect(content).toContain('opponent_id="999"');
    // 头部 XSL 统计行
    expect(content).toContain('href="#douyin_pk"');
    expect(content).toContain("count(/i/douyin_pk)");
  });

  it("should write multi-opponent douyin pk opponents", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);

    controller.addMessage({
      type: "douyin_pk",
      timestamp: controller.data.meta.recordStartTimestamp,
      event: "scores",
      battleId: "b1",
      myScore: "297",
      opponents: [
        { anchorId: "111", score: "4", rank: 2 },
        { anchorId: "222", score: "3", rank: 3 },
      ],
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain('my_score="297"');
    expect(content).toContain('opponents="111:4:2,222:3:3"');
  });

  it("should write readable douyin pk fields", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);

    controller.addMessage({
      type: "douyin_pk",
      timestamp: controller.data.meta.recordStartTimestamp + 10_000,
      event: "scores",
      battleId: "b2",
      elapsed: 10,
      myScore: "2564",
      myScoreText: "2.5千",
      myRank: 4,
      myName: "天绮一也",
      myHomepage: "https://www.douyin.com/user/sec-self",
      opponentScore: "131391",
      opponentScoreText: "13.1万",
      opponents: [
        {
          anchorId: "111",
          label: "对手1",
          anchorName: "七七",
          homepage: "https://www.douyin.com/user/sec-111",
          score: "131391",
          scoreText: "13.1万",
          rank: 1,
        },
        { anchorId: "222", label: "对手2", score: "74568", scoreText: "7.4万", rank: 2 },
      ],
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).toContain('pkt="10"');
    expect(content).toContain('my_score_text="2.5千"');
    expect(content).toContain('my_rank="4"');
    expect(content).toContain('my_name="天绮一也"');
    expect(content).toContain('my_homepage="https://www.douyin.com/user/sec-self"');
    expect(content).toContain('opponent_score_text="13.1万"');
    expect(content).toContain('opponent_homepage="https://www.douyin.com/user/sec-111"');
    expect(content).toContain('diff="-128827"');
    // 有昵称时优先显示昵称
    expect(content).toContain('opponents_readable="七七 13.1万 第1，对手2 7.4万 第2"');
  });

  it("should skip army snapshots without score", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);

    controller.addMessage({
      type: "douyin_pk",
      timestamp: controller.data.meta.recordStartTimestamp,
      event: "armies",
      contextBattleId: "b3",
      myArmies: [{ uid: "1", nickname: "粉丝A", score: "100" }],
      opponentArmies: [{ uid: "2", nickname: "粉丝B", score: "20" }],
      opponents: [
        { anchorId: "111", label: "对手1" },
        { anchorId: "222", label: "对手2", armies: [{ uid: "2", nickname: "粉丝B", score: "20" }] },
      ],
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    // 空快照不再写出 "id::"，只保留有贡献榜数据的对手
    expect(content).not.toContain("111::");
    expect(content).toContain('battle_id="b3"');
    expect(content).toContain('my_armies="粉丝A 100"');
    expect(content).toContain('opponent_armies="粉丝B 20"');
    expect(content).toContain('opponents_readable="对手2 榜 粉丝B 20"');
    // 结构化子节点：每个助力用户一条
    expect(content).toContain(
      '<army side="mine" anchor_id="" rank="1" uid="1" nickname="粉丝A" score="100"',
    );
    expect(content).toContain(
      '<army side="opponent" anchor_id="222" rank="1" uid="2" nickname="粉丝B" score="20"',
    );
  });

  it("should write a markdown pk report next to the xml", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    const start = controller.data.meta.recordStartTimestamp;
    const opponents = [
      {
        anchorId: "111",
        label: "对手1",
        anchorName: "七七",
        homepage: "https://www.douyin.com/user/sec-111",
        score: "131391",
        scoreText: "13.1万",
        rank: 1,
      },
      { anchorId: "222", label: "对手2", score: "74568", scoreText: "7.4万", rank: 2 },
    ];

    controller.addMessage({
      type: "douyin_pk",
      timestamp: start,
      event: "start",
      battleId: "battle-9",
      duration: 300,
      elapsed: 0,
    });
    controller.addMessage({
      type: "douyin_pk",
      timestamp: start + 10_000,
      event: "scores",
      battleId: "battle-9",
      elapsed: 10,
      myScore: "2405",
      myScoreText: "2405",
      myRank: 3,
      opponents,
    });
    controller.addMessage({
      type: "douyin_pk",
      timestamp: start + 20_000,
      event: "finish",
      battleId: "battle-9",
      duration: 300,
      elapsed: 300,
      myScore: "2564",
      myScoreText: "2564",
      myRank: 3,
      myName: "天绮一也",
      myHomepage: "https://www.douyin.com/user/sec-self",
      opponents,
      myArmies: [{ uid: "1", nickname: "秋年", score: "1200", rank: 1 }],
      opponentArmies: [{ uid: "2", nickname: "路鹿", score: "800", rank: 1 }],
    });

    await controller.flush();

    const md = await fs.readFile(path.join(tempDir, "record.pk.md"), "utf-8");
    expect(md).toContain("# 抖音 PK 战报");
    expect(md).toContain("## 总览");
    expect(md).toContain("## 第 1 局");
    expect(md).toContain("### 最终比分");
    expect(md).toContain("13.1万");
    expect(md).toContain("### 助力榜（快照）");
    expect(md).toContain("秋年");
    expect(md).toContain("### 比分曲线");
    expect(md).toContain("落后");
    // 主播名称与主页链接
    expect(md).toContain("[天绮一也](https://www.douyin.com/user/sec-self)");
    expect(md).toContain("[七七](https://www.douyin.com/user/sec-111)");
    expect(md).toContain("`111`");
  });

  it("should not write a pk report when there is no pk message", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);
    controller.addMessage({
      type: "comment",
      timestamp: controller.data.meta.recordStartTimestamp,
      text: "hello",
      sender: { name: "u1", uid: "1" },
    });
    await controller.flush();

    await expect(fs.access(path.join(tempDir, "record.pk.md"))).rejects.toThrow();
  });

  it("should not write douyin_pk nodes when there is no douyin_pk message", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xml-stream-controller-"));
    tempDirs.push(tempDir);

    const xmlPath = path.join(tempDir, "record.xml");
    const controller = createRecordExtraDataController(xmlPath);

    controller.addMessage({
      type: "comment",
      timestamp: controller.data.meta.recordStartTimestamp,
      text: "hello",
      sender: { name: "u1", uid: "1" },
    });

    await controller.flush();

    const content = await fs.readFile(xmlPath, "utf-8");
    expect(content).not.toContain("<douyin_pk");
  });
});
