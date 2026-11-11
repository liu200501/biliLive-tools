import { AnyObject, UnknownObject } from "./utils.js";

export type ChannelId = string;

export const Qualities = ["lowest", "low", "medium", "high", "highest"] as const;
export const DouyuQualities = [0, 2, 3, 4, 8] as const;
// 14100: 2K HDR；14000：2K；4200：HDR(10M)；0：原画；8000：蓝光8M；4000：蓝光4M；2000：超清；500：流畅
export const HuYaQualities = [
  0, 20000, 14100, 14000, 10000, 8000, 4200, 4000, 2000, 500, -1,
] as const;
export const DouYinQualities = ["origin", "uhd", "hd", "sd", "ld", "ao", "real_origin"] as const;
export type Quality = string | number;

export interface MessageSender<E extends AnyObject = UnknownObject> {
  uid?: string;
  name: string;
  avatar?: string;
  extra?: E;
}

export interface Comment<E extends AnyObject = UnknownObject> {
  type: "comment";
  timestamp: number;
  text: string;
  mode?: number;
  color?: string;
  sender?: MessageSender;
  extra?: E;
}

export interface GiveGift<E extends AnyObject = UnknownObject> {
  type: "give_gift";
  timestamp: number;
  name: string;
  count: number;
  price: number;
  text?: string;
  cost?: number;
  color?: string;
  sender?: MessageSender;
  extra?: E;
}

export interface Guard<E extends AnyObject = UnknownObject> {
  type: "guard";
  timestamp: number;
  name: string;
  count: number;
  price: number;
  level: number;
  text?: string;
  cost?: number;
  color?: string;
  sender?: MessageSender;
  extra?: E;
}

export interface SuperChat<E extends AnyObject = UnknownObject> {
  type: "super_chat";
  timestamp: number;
  text: string;
  price: number;
  sender?: MessageSender;
  extra?: E;
}

export interface PkStatus<E extends AnyObject = UnknownObject> {
  type: "pk_status";
  timestamp: number;
  /** 原始 pk_status 值 */
  status: number;
  /** 对战对手等信息（可选） */
  opponent?: {
    uid?: string;
    name?: string;
  };
  extra?: E;
}

export type DouyinPkEventType = "start" | "status" | "scores" | "armies" | "finish";

/**
 * 抖音 PK（连麦对战）事件。
 * 每个生命周期/比分/贡献/结束事件各写一条记录。
 */
export interface DouyinPk<E extends AnyObject = UnknownObject> {
  type: "douyin_pk";
  timestamp: number;
  /** 事件类型 */
  event: DouyinPkEventType;
  /** PK 对局 ID（armies 事件本身不带，可能为 null） */
  battleId?: string | null;
  /** 关联的对局 ID（armies 事件通过上下文推断） */
  contextBattleId?: string | null;
  /** PK 时长（秒） */
  duration?: number;
  /** 距本局 PK 开始的秒数（start 事件为 0） */
  elapsed?: number;
  /** 我方 PK 值 */
  myScore?: string;
  /** 我方 PK 值的可读文案（如「2.5万」），抖音未提供时回退为原始值 */
  myScoreText?: string;
  /** 我方当前排名（来自 battle_rank） */
  myRank?: number;
  /** 我方主播昵称 */
  myName?: string;
  /** 我方主播主页链接 */
  myHomepage?: string;
  /** 对方 PK 值（仅单对手时的兼容字段，等同 opponents[0].score） */
  opponentScore?: string;
  /** 对方 PK 值的可读文案 */
  opponentScoreText?: string;
  /** 对方主播 uid（兼容字段） */
  opponentId?: string | null;
  /** 对方主播昵称（如可获取） */
  opponentName?: string | null;
  /** 所有对手（支持多人 PK） */
  opponents?: DouyinPkOpponent[];
  /** 我方贡献榜前三 */
  myArmies?: { uid?: string | null; nickname: string; score: string; rank?: number }[];
  /** 对方贡献榜前三（兼容字段，等同 opponents[0].armies） */
  opponentArmies?: { uid?: string | null; nickname: string; score: string; rank?: number }[];
  /** 无法对应到具体主播的助力（多人 PK 的散票） */
  unassignedArmies?: { uid?: string | null; nickname: string; score: string; rank?: number }[];
  extra?: E;
}

/** 抖音 PK 中的一个对手 */
export interface DouyinPkOpponent {
  anchorId?: string | null;
  anchorName?: string | null;
  /** 主播主页链接（需已知 sec_uid） */
  homepage?: string;
  /** 同一对局内稳定的展示别名，如「对手1」 */
  label?: string;
  score?: string;
  /** 分值的可读文案（如「13.1万」） */
  scoreText?: string;
  rank?: number;
  /** 对方贡献榜前三 */
  armies?: { uid?: string | null; nickname: string; score: string; rank?: number }[];
}

export type Message = Comment | GiveGift | SuperChat | Guard | PkStatus | DouyinPk;
