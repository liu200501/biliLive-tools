import { describe, expect, it } from "vitest";

import { decodePkMessage, PkMessageHandler } from "../src/pk";

// Sanitized wire captures，来自 DouYin_Spider/tests/test_live_pk_ws.py
// 2026-09-19 经浏览器独立解码验证。保留原始 tag/值，替换了 ID/昵称。
const START = Buffer.from(
  "0a1b108180daea81aad5a169188280daea81aad5a16920e4ceefc18b34124d108380daea81aad5a16918b3cbefc18b3420ac02308480daea81aad5a169c00201d2021337353835303030303030303030303030303033da021337353835303030303030303030303030303034",
  "hex",
);
const SCORES = Buffer.from(
  "0a1b108580daea81aad5a169188280daea81aad5a16920e7d281c28b3410ca01408480daea81aad5a1698a012a08da01108680daea81aad5a1693a033231384001aa0113373538353030303030303030303030303030368a012a08d301108780daea81aad5a1693a033231314002aa011337353835303030303030303030303030303037c0068380daea81aad5a16992071337353835303030303030303030303030303033",
  "hex",
);
const ARMIES = Buffer.from(
  "0a1b108880daea81aad5a169188280daea81aad5a16920b2d981c28b34124f088780daea81aad5a16912430a15088980daea81aad5a16910c6011a065669657765720a14088a80daea81aad5a16910051a065669657765720a14088b80daea81aad5a16910051a06566965776572124e088680daea81aad5a16912420a14088c80daea81aad5a16910631a065669657765720a14088d80daea81aad5a16910371a065669657765720a14088e80daea81aad5a16910071a06566965776572",
  "hex",
);
const FINISH = Buffer.from(
  "0a1b108f80daea81aad5a169188280daea81aad5a1692088f581c28b34124d108380daea81aad5a16918b3cbefc18b3420ac02308480daea81aad5a169c00202d2021337353835303030303030303030303030303033da0213373538353030303030303030303030303030341aa101088780daea81aad5a169122a088980daea81aad5a169120656696577657220c6012a13373538353030303030303030303030303030391229088a80daea81aad5a169120656696577657220052a13373538353030303030303030303030303031301229088b80daea81aad5a169120656696577657220052a13373538353030303030303030303030303031311a13373538353030303030303030303030303030371aa001088680daea81aad5a1691229088c80daea81aad5a169120656696577657220632a13373538353030303030303030303030303031321229088d80daea81aad5a169120656696577657220372a13373538353030303030303030303030303031331229088e80daea81aad5a169120656696577657220072a13373538353030303030303030303030303031341a1337353835303030303030303030303030303036222a08da01108680daea81aad5a1694213373538353030303030303030303030303030367a03323138800101222a08d301108780daea81aad5a1694213373538353030303030303030303030303030377a03323131800102",
  "hex",
);

const BATTLE = "7585000000000000003";
const CHANNEL = "7585000000000000004";

describe("decodePkMessage", () => {
  it("should decode lifecycle, scores and exact ids", () => {
    const start = decodePkMessage("WebcastLinkMicBattleMethod", START);
    const scores = decodePkMessage("LinkMicMethod", SCORES);
    const armies = decodePkMessage("WebcastLinkMicArmiesMethod", ARMIES);
    const finish = decodePkMessage("LinkMicBattleFinishMethod", FINISH);

    expect(start).not.toBeNull();
    expect([start!.battle_id, start!.channel_id]).toEqual([BATTLE, CHANNEL]);
    expect([start!.type, start!.duration]).toEqual(["start", 300]);

    expect(scores).not.toBeNull();
    expect(scores!.scores!.map((s) => s.score)).toEqual(["218", "211"]);
    expect(scores!.scores!.map((s) => s.anchor_id)).toEqual([
      "7585000000000000006",
      "7585000000000000007",
    ]);

    expect(armies).not.toBeNull();
    expect(armies!.battle_id).toBeNull();
    expect(armies!.has_unsupported_rank_list_v2).toBe(false);
    const users = armies!.anchors![0].users;
    expect(users.map((u) => u.score)).toEqual(["99", "55", "7"]);
    expect(users.map((u) => u.uid)).toEqual([
      "7585000000000000012",
      "7585000000000000013",
      "7585000000000000014",
    ]);
    expect(users[0].nickname).toBe("Viewer");

    expect(finish).not.toBeNull();
    expect(finish!.battle_id).toBe(BATTLE);
    expect(finish!.scores).toEqual(scores!.scores);
    expect(
      [...finish!.anchors!].sort((a, b) => (a.anchor_id ?? "").localeCompare(b.anchor_id ?? "")),
    ).toEqual(armies!.anchors);
  });

  it("should ignore non-pk messages and unknown play modes", () => {
    expect(decodePkMessage("WebcastChatMessage", Buffer.from("anything"))).toBeNull();
    expect(decodePkMessage("LinkMicMethod", Buffer.from("\x10\x64", "binary"))).toBeNull();

    const event = decodePkMessage("LinkMicArmiesMethod", Buffer.from("\x22\x02\x08\x01", "binary"));
    expect(event).not.toBeNull();
    expect(event!.has_unsupported_rank_list_v2).toBe(true);
  });
});

describe("PkMessageHandler", () => {
  it("should dedup, infer context and ignore stale armies", () => {
    const handler = new PkMessageHandler();

    // 没有活跃 battle 时，armies 无法推断 context
    expect(handler.handle("LinkMicArmiesMethod", ARMIES)!.context_battle_id).toBeNull();

    handler.handle("LinkMicBattleMethod", START);
    const event = handler.handle("WebcastLinkMicArmiesMethod", ARMIES, 99);
    expect(event!.context_battle_id).toBe(BATTLE);
    expect(event!.battle_id).toBeNull();

    // 相同 msg_id 去重
    expect(handler.handle("LinkMicArmiesMethod", ARMIES, 99)).toBeNull();

    handler.handle("WebcastLinkMicBattleFinishMethod", FINISH);
    // 不同 msg_id 但结果完全一致的 finish 去重
    expect(handler.handle("LinkMicBattleFinishMethod", FINISH, 100)).toBeNull();

    // finish 之后 armies 不再关联旧 battle
    expect(handler.handle("LinkMicArmiesMethod", ARMIES, 101)!.context_battle_id).toBeNull();
  });

  it("should dedup armies snapshots without msg_id", () => {
    const handler = new PkMessageHandler();
    // 该 payload 没有 common.msgId，只能按内容签名去重
    const payload = Buffer.from("\x22\x02\x08\x01", "binary");

    expect(handler.handle("LinkMicArmiesMethod", payload)).not.toBeNull();
    expect(handler.handle("LinkMicArmiesMethod", payload)).toBeNull();
  });
});

// ---- 手搓 protobuf ----
function varint(value: bigint): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80n) {
    bytes.push(Number(rest & 0x7fn) | 0x80);
    rest >>= 7n;
  }
  bytes.push(Number(rest));
  return bytes;
}

function tag(field: number, wire: number): number[] {
  return varint(BigInt((field << 3) | wire));
}

function bytesField(field: number, payload: number[]): number[] {
  return [...tag(field, 2), ...varint(BigInt(payload.length)), ...payload];
}

function armyUser(uid: bigint, score: bigint, nickname: string): number[] {
  const name = [...Buffer.from(nickname, "utf8")];
  return [...tag(1, 0), ...varint(uid), ...tag(2, 0), ...varint(score), ...bytesField(3, name)];
}

function userArmies(users: number[][]): number[] {
  return users.flatMap((user) => bytesField(1, user));
}

/** user_armies_map 的一条 entry：field1 = int64 key，field2 = UserArmies */
function armyEntry(anchorId: bigint, users: number[][]): number[] {
  return [...tag(1, 0), ...varint(anchorId), ...bytesField(2, userArmies(users))];
}

describe("armies 精度与去重", () => {
  it("应精确还原超过 2^53 的主播 uid", () => {
    // 真实值 7669311243275273253，Number 化后变成 7669311243275273000
    const payload = Buffer.from(
      bytesField(2, armyEntry(7669311243275273253n, [armyUser(2504027341605680n, 3n, "芙芙")])),
    );

    const event = decodePkMessage("WebcastLinkMicArmiesMethod", payload);
    expect(event!.anchors![0].anchor_id).toBe("7669311243275273253");
    expect(event!.anchors![0].users).toEqual([
      { rank: 1, uid: "2504027341605680", nickname: "芙芙", score: "3" },
    ]);
  });

  it("user_armies_list 里已归属的用户不应重复进散票", () => {
    const mine = armyUser(1n, 10n, "甲");
    const payload = Buffer.from([
      ...bytesField(2, armyEntry(7669311243275273253n, [mine])),
      // 汇总列表重复了同一个人，外加一个真正没归属的
      ...bytesField(3, userArmies([mine, armyUser(2n, 5n, "乙")])),
    ]);

    const event = decodePkMessage("WebcastLinkMicArmiesMethod", payload);
    expect(event!.unassigned_armies).toEqual([
      // rank 沿用源列表顺序
      [{ rank: 2, uid: "2", nickname: "乙", score: "5" }],
    ]);
  });

  it("全部用户都已归属时不产生散票", () => {
    const mine = armyUser(1n, 10n, "甲");
    const payload = Buffer.from([
      ...bytesField(2, armyEntry(123n, [mine])),
      ...bytesField(3, userArmies([mine])),
    ]);

    expect(decodePkMessage("WebcastLinkMicArmiesMethod", payload)!.unassigned_armies).toEqual([]);
  });
});
