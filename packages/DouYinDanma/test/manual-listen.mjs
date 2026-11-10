// 手动验证脚本：只连弹幕，不录制。
// 用法：node packages/DouYinDanma/test/manual-listen.mjs <roomId>
// 例如：node packages/DouYinDanma/test/manual-listen.mjs 123456789
import DouYinDanmaClient from "../lib/index.js";

const roomId = process.argv[2];
if (!roomId) {
  console.error("用法: node manual-listen.mjs <roomId>");
  process.exit(1);
}

const client = new DouYinDanmaClient(roomId, {
  autoStart: true,
  debugMethod: true,
});

client.on("open", () => console.log("[open] 弹幕已连接"));
client.on("error", (e) => console.error("[error]", e.message));
client.on("close", () => console.log("[close]"));
client.on("pk", (e) => {
  console.log("[PK]", e.type, JSON.stringify({
    battle_id: e.battle_id,
    scores: e.scores,
    anchors: e.anchors?.map((a) => ({ anchor: a.anchor_id, users: a.users.length })),
  }));
});
client.on("chat", (m) => {
  // 只打印少量弹幕，确认连接活着
  if (Math.random() < 0.02) console.log("[chat]", m.user?.nickName, m.content);
});

setTimeout(() => {
  console.log("[exit] 5 分钟到，退出");
  client.close();
  process.exit(0);
}, 5 * 60 * 1000);
