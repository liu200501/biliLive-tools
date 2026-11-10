import { describe, it } from "vitest";

import DouYinDanmaClient from "../src/index";

// 手动监听：统计所有消息 method，打印 chat 与 PK。
// 用法：DOUYIN_ROOM_ID=xxx node ./node_modules/vitest/vitest.mjs run packages/DouYinDanma/test/manual-listen.test.ts --testTimeout=300000
const roomId = process.env.DOUYIN_ROOM_ID;
const listenSeconds = Number(process.env.LISTEN_SECONDS ?? 120);

describe.skipIf(!roomId)("manual listen", () => {
  it(
    "should receive pk events",
    async () => {
      const client = new DouYinDanmaClient(roomId!, {
        autoStart: true,
        debugMethod: true, // 开启帧级调试日志
      });

      const methodCount = new Map<string, number>();
      const bump = (name: string) => methodCount.set(name, (methodCount.get(name) ?? 0) + 1);

      client.on("open", () => console.log("[open] 弹幕已连接"));
      client.on("error", (e) => console.error("[error]", e.message));
      client.on("close", () => console.log("[close]"));
      client.on("init", (url) => console.log("[init] room", url.match(/room_id=(\d+)/)?.[1]));

      // 统计所有已知消息
      client.on("chat", (m) => {
        bump("chat");
        if ((methodCount.get("chat") ?? 0) <= 5) console.log("[chat]", m.user?.nickName, m.content);
      });
      client.on("member", () => bump("member"));
      client.on("like", () => bump("like"));
      client.on("gift", (m) => {
        bump("gift");
        if ((methodCount.get("gift") ?? 0) <= 3) console.log("[gift]", m.user?.nickName, m.gift?.name);
      });
      client.on("roomStats", () => bump("roomStats"));
      client.on("roomUserSeq", () => bump("roomUserSeq"));
      client.on("message", (m: any) => {
        const method = m?.common?.method ?? "unknown";
        if (method !== "WebcastChatMessage") bump(method);
      });

      // PK 事件全量打印
      client.on("pk", (e) => {
        console.log(
          "[PK]",
          e.type,
          JSON.stringify({
            battle_id: e.battle_id,
            context_battle_id: e.context_battle_id,
            duration: e.duration,
            battle_status: e.battle_status,
            scores: e.scores,
            anchors: e.anchors?.map((a) => ({ anchor: a.anchor_id, users: a.users.length })),
          }),
        );
      });

      await new Promise((resolve) => setTimeout(resolve, listenSeconds * 1000));
      client.close();

      console.log("\n===== 统计结果 =====");
      console.log("监听时长:", listenSeconds, "秒");
      const sorted = [...methodCount.entries()].sort((a, b) => b[1] - a[1]);
      for (const [name, count] of sorted) {
        console.log(`  ${name}: ${count}`);
      }
      console.log("===================");
    },
    (listenSeconds + 60) * 1000,
  );
});
