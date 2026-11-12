import protobuf from "./proto.js";

/**
 * 抖音 PK（连麦对战）消息解码与去重。
 * 移植自 DouYin_Spider/dy_live/pk.py（基于真实抓包验证）。
 *
 * Armies 推送是贡献榜的部分快照，不是 HTTP 完整榜单。
 * 它们本身不带 battle_id，`context_battle_id` 只从当前活跃且时间兼容的
 * 生命周期/比分事件推断，永远不是确认的 ID。
 */

export interface PkScore {
  anchor_id: string | null;
  score: string;
  score_blur_text: string;
  score_relative_text: string;
  battle_rank: number;
}

export interface PkRankUser {
  rank: number;
  uid: string | null;
  nickname: string;
  score: string;
}

export interface PkAnchorArmy {
  anchor_id: string | null;
  users: PkRankUser[];
}

export type PkEventType = "start" | "status" | "scores" | "armies" | "finish";

export interface PkEvent {
  method: string;
  type: PkEventType;
  msg_id: string | null;
  room_id: string | null;
  create_time_ms: number;
  battle_id: string | null;
  channel_id: string | null;
  context_battle_id: string | null;
  context_channel_id: string | null;
  /** start/status */
  battle_status?: number;
  start_time_ms?: number;
  duration?: number;
  /** scores/finish */
  scores?: PkScore[];
  /** armies/finish */
  anchors?: PkAnchorArmy[];
  /** armies */
  unassigned_armies?: PkRankUser[][];
  has_unsupported_rank_list_v2?: boolean;
  /** finish */
  end_reason?: number;
}

// method 去掉 Webcast 前缀后的映射
const PK_MESSAGES: Record<string, unknown> = {
  LinkMicMethod: (protobuf as any).douyin.LinkMicMethod,
  LinkMicArmiesMethod: (protobuf as any).douyin.LinkMicArmies,
  LinkMicBattleMethod: (protobuf as any).douyin.LinkMicBattle,
  LinkMicBattleFinishMethod: (protobuf as any).douyin.LinkMicBattleFinish,
};

/** 已知的 PK 相关 method（含别名），用于分发判断 */
export const PK_METHODS = new Set([
  "WebcastLinkMicMethod",
  "LinkMicMethod",
  "WebcastLinkMicArmiesMethod",
  "LinkMicArmiesMethod",
  "WebcastLinkMicBattleMethod",
  "LinkMicBattleMethod",
  "WebcastLinkMicBattleFinishMethod",
  "LinkMicBattleFinishMethod",
]);

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  // protobufjs 默认把 int64 解为 Long 对象
  if (typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  // Long 还可能是字符串（超出安全整数范围时）
  if (typeof value === "string") return Number(value) || 0;
  return Number(value) || 0;
}

/** int64 转字符串 ID，支持 Long 对象与字符串，避免精度丢失 */
function toIdString(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value && value !== "0" ? value : null;
  }
  if (typeof value === "bigint") {
    const str = value.toString();
    return str !== "0" ? str : null;
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    const str = value.toString();
    return str && str !== "0" ? str : null;
  }
  const str = String(value);
  return str && str !== "0" ? str : null;
}

/**
 * protobufjs 把 map<int64, ...> 的 key 解成 8 字节原始字符串（小端 int64），
 * 需要还原为十进制字符串。普通数字字符串原样返回。
 */
function decodeMapKey(key: string): string | null {
  if (!key) return null;
  let result = key;
  if (key.length === 8) {
    let value = 0n;
    for (let i = 7; i >= 0; i--) {
      value = (value << 8n) + BigInt(key.charCodeAt(i));
    }
    result = value.toString();
  }
  return result && result !== "0" ? result : null;
}

function readVarint(bytes: Uint8Array, start: number): { value: bigint; pos: number } {
  let value = 0n;
  let shift = 0n;
  let pos = start;
  while (pos < bytes.length) {
    const byte = bytes[pos++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return { value, pos };
}

type DecodedArmy = { anchor_id: string | null; users: any[] };

/**
 * 直接从原始字节里读 `user_armies_map`。
 *
 * protobufjs 未加载 `long` 时会把 int64 解成 JS Number，19 位 uid 会丢掉末几位
 * （7669311243275273253 → 7669311243275273000），导致同一个主播被当成两个对手。
 * 这里用 BigInt 逐字节读 varint，保证 map key 精确。
 */
function readArmyMapEntries(payload: Uint8Array): DecodedArmy[] | null {
  const UserArmies = (protobuf as any).douyin?.UserArmies;
  if (!UserArmies) return null;

  const entries: DecodedArmy[] = [];
  let pos = 0;
  while (pos < payload.length) {
    const tag = readVarint(payload, pos);
    pos = tag.pos;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);

    if (wire === 2) {
      const length = readVarint(payload, pos);
      pos = length.pos;
      const end = Math.min(pos + Number(length.value), payload.length);
      if (field === 2) {
        let cursor = pos;
        let anchorId: string | null = null;
        let users: any[] = [];
        while (cursor < end) {
          const entryTag = readVarint(payload, cursor);
          cursor = entryTag.pos;
          const entryField = Number(entryTag.value >> 3n);
          const entryWire = Number(entryTag.value & 7n);
          if (entryWire === 0) {
            const value = readVarint(payload, cursor);
            cursor = value.pos;
            if (entryField === 1) anchorId = value.value.toString();
          } else if (entryWire === 2) {
            const entryLength = readVarint(payload, cursor);
            cursor = entryLength.pos;
            const sliceEnd = Math.min(cursor + Number(entryLength.value), end);
            if (entryField === 2) {
              const decoded = UserArmies.decode(payload.subarray(cursor, sliceEnd)) as any;
              users = decoded?.userArmies ?? [];
            }
            cursor = sliceEnd;
          } else if (entryWire === 5) {
            cursor += 4;
          } else if (entryWire === 1) {
            cursor += 8;
          } else {
            break;
          }
        }
        if (anchorId && anchorId !== "0") entries.push({ anchor_id: anchorId, users });
      }
      pos = end;
    } else if (wire === 0) {
      pos = readVarint(payload, pos).pos;
    } else if (wire === 5) {
      pos += 4;
    } else if (wire === 1) {
      pos += 8;
    } else {
      return null;
    }
  }

  return entries.length > 0 ? entries : null;
}

function timeMs(value: number): number {
  // create_time 可能以秒或毫秒出现
  return value > 0 && value < 100_000_000_000 ? value * 1000 : value;
}

function ranks(users: any[]): PkRankUser[] {
  return users.map((u, index) => ({
    rank: index + 1,
    uid: u.userIdStr || toIdString(u.userId),
    nickname: u.nickname ?? "",
    score: String(u.score ?? "0"),
  }));
}

function scores(users: any[]): PkScore[] {
  return users.map((u) => ({
    anchor_id: u.userIdStr || toIdString(u.userId),
    score: String(u.score ?? "0"),
    score_blur_text: u.scoreBlurText ?? "",
    score_relative_text: u.scoreRelativeText ?? "",
    battle_rank: toNumber(u.battleRank),
  }));
}

/**
 * 解码单条 PK 消息。非 PK 消息返回 null。
 * protobuf 解码错误直接抛给调用方，避免一条坏消息丢弃后续消息。
 */
export function decodePkMessage(method: string, payload: Uint8Array, msgId = 0): PkEvent | null {
  const canonical = method.replace(/^Webcast/, "");
  const cls: any = PK_MESSAGES[canonical];
  if (!cls) return null;

  const message = cls.decode(payload);
  const common = message.common ?? {};
  const event: PkEvent = {
    method,
    type: "status",
    msg_id: msgId ? String(msgId) : toIdString(common.msgId),
    room_id: toIdString(common.roomId),
    create_time_ms: timeMs(toNumber(common.createTime)),
    battle_id: null,
    channel_id: null,
    context_battle_id: null,
    context_channel_id: null,
  };

  if (canonical === "LinkMicMethod") {
    if (toNumber(message.messageType) !== 202) return null;
    event.type = "scores";
    event.battle_id = message.battleIdStr || toIdString(message.battleId);
    event.channel_id = toIdString(message.channelId);
    event.scores = scores(message.userScores ?? []);
  } else if (canonical === "LinkMicArmiesMethod") {
    event.type = "armies";
    // 优先从原始字节精确还原 map key（见 readArmyMapEntries 注释）
    const exact = readArmyMapEntries(payload);
    if (exact) {
      event.anchors = exact
        .map((army) => ({
          anchor_id: army.anchor_id,
          users: ranks(army.users),
        }))
        .sort((a, b) => (a.anchor_id ?? "").localeCompare(b.anchor_id ?? ""));
    } else {
      const map = message.userArmiesMap ?? {};
      event.anchors = Object.keys(map)
        .sort()
        .map((anchor) => ({
          anchor_id: decodeMapKey(anchor),
          users: ranks(map[anchor]?.userArmies ?? []),
        }));
    }

    // user_armies_list 在真实报文里是「全部助力」的汇总，会和归属榜重复，
    // 这里剔除已经归属到某位主播的用户，只留真正对不上主播的散票。
    const attributed = new Set(
      (event.anchors ?? []).flatMap((army) => army.users.map((user) => user.uid)),
    );
    const seen = new Set<string>();
    const unassigned: PkRankUser[] = [];
    for (const army of message.userArmiesList ?? []) {
      for (const user of ranks(army?.userArmies ?? [])) {
        if (!user.uid || attributed.has(user.uid) || seen.has(user.uid)) continue;
        seen.add(user.uid);
        unassigned.push(user);
      }
    }
    event.unassigned_armies = unassigned.length > 0 ? [unassigned] : [];
    // rank_list_v2 为 bytes，非空表示使用未支持的玩法 schema
    const v2 = message.rankListV2;
    event.has_unsupported_rank_list_v2 = !!(v2 && v2.length > 0);
  } else {
    const settings = message.battleSettings ?? {};
    event.battle_id = settings.battleIdStr || toIdString(settings.battleId);
    event.channel_id = settings.channelIdStr || toIdString(settings.channelId);
    event.start_time_ms = toNumber(settings.startTimeMs);
    event.duration = toNumber(settings.duration);
    event.battle_status = toNumber(settings.battleStatus);

    if (canonical === "LinkMicBattleFinishMethod") {
      event.type = "finish";
      event.end_reason = toNumber(message.endReason);
      event.scores = scores(message.battleScores ?? []);
      event.anchors = (message.battleArmies ?? []).map((army: any) => ({
        anchor_id: army.anchorIdStr || toIdString(army.anchorId),
        users: ranks(army.rankList ?? []),
      }));
    } else {
      event.type = event.battle_status === 1 ? "start" : "status";
    }
  }

  return event;
}

interface ActiveBattle {
  battle_id: string;
  channel_id: string | null;
  since: number;
}

/**
 * 单连接内的有界去重与保守上下文推断。
 * 等价于 Python 的 PKMessageHandler。
 */
export class PkMessageHandler {
  private active: ActiveBattle | null = null;
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private finished = new Set<string>();
  private finishedOrder: string[] = [];

  private remember(order: string[], cache: Set<string>, key: string, limit = 512): boolean {
    const duplicate = cache.has(key);
    cache.add(key);
    order.push(key);
    if (order.length > limit) {
      const removed = order.shift();
      if (removed !== undefined) cache.delete(removed);
    }
    return duplicate;
  }

  handle(method: string, payload: Uint8Array, msgId = 0): PkEvent | null {
    const event = decodePkMessage(method, payload, msgId);
    if (!event) return null;

    if (
      event.msg_id &&
      this.remember(this.seenOrder, this.seen, `${method.replace(/^Webcast/, "")}:${event.msg_id}`)
    ) {
      return null;
    }

    const kind = event.type;
    const battleId = event.battle_id;

    // armies 往往没有 msg_id，只能按内容签名去重（同一条快照会被重复推送）；
    // 有 msg_id 时交给上面的按 id 去重，避免把带新 id 的后续快照误杀
    if (kind === "armies" && !event.msg_id) {
      const armyKey = JSON.stringify([
        event.battle_id ?? event.context_battle_id,
        event.create_time_ms,
        (event.anchors ?? []).map((a) => [a.anchor_id, a.users.map((u) => [u.uid, u.score])]),
        (event.unassigned_armies ?? []).map((army) => army.map((u) => [u.uid, u.score])),
      ]);
      if (this.remember(this.seenOrder, this.seen, `armies:${armyKey}`)) {
        return null;
      }
    }

    if (kind === "finish") {
      const finishKey = JSON.stringify([
        battleId,
        (event.scores ?? [])
          .slice()
          .sort((a, b) => (a.anchor_id ?? "").localeCompare(b.anchor_id ?? "")),
        (event.anchors ?? [])
          .slice()
          .sort((a, b) => (a.anchor_id ?? "").localeCompare(b.anchor_id ?? "")),
        event.end_reason ?? null,
      ]);
      if (battleId && this.remember(this.seenOrder, this.seen, `finish:${finishKey}`)) {
        return null;
      }
      if (battleId) {
        this.remember(this.finishedOrder, this.finished, battleId, 128);
      }
      if (this.active && battleId === this.active.battle_id) {
        this.active = null;
      }
    } else if (
      (kind === "start" || kind === "scores") &&
      battleId &&
      !this.finished.has(battleId)
    ) {
      const since = event.start_time_ms || event.create_time_ms;
      const sameBattle = this.active && battleId === this.active.battle_id;
      if (sameBattle) {
        this.active!.channel_id = event.channel_id || this.active!.channel_id;
      } else if (!this.active || (since && since >= this.active.since)) {
        this.active = { battle_id: battleId, channel_id: event.channel_id, since };
      }
    } else if (kind === "status" && this.active && battleId === this.active.battle_id) {
      if (event.battle_status === 2 || event.battle_status === 3) {
        this.active = null;
      }
    } else if (kind === "armies" && this.active) {
      const { since } = this.active;
      const created = event.create_time_ms;
      if (since && created && created >= since) {
        event.context_battle_id = this.active.battle_id;
        event.context_channel_id = this.active.channel_id;
      }
    }

    return event;
  }
}
