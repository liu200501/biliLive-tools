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
    expect(content).toContain('count(/i/pk)');
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
    expect(content).toContain('count(/i/douyin_pk)');
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
