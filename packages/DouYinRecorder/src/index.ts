import path from "node:path";
import mitt from "mitt";
import {
  defaultFromJSON,
  defaultToJSON,
  genRecorderUUID,
  genRecordUUID,
  utils,
  createDownloader,
} from "@bililive-tools/manager";
import type {
  Recorder,
  RecorderCreateOpts,
  RecorderProvider,
  RecordHandle,
  Comment,
  GiveGift,
} from "@bililive-tools/manager";

import { getInfo, getStream } from "./stream.js";
import { singleton } from "./utils.js";
import { resolveShortURL, parseUser } from "./douyin_api.js";

import DouYinDanmaClient from "douyin-danma-listener";
import type { DouyinPk, DouyinPkOpponent } from "@bililive-tools/manager";

import { anchorHomepage, getAnchorProfile, rememberAnchor } from "./anchor.js";

import type { APIType } from "./types.js";

function createRecorder(opts: RecorderCreateOpts): Recorder {
  // 内部实现时，应该只有 proxy 包裹的那一层会使用这个 recorder 标识符，不应该有直接通过
  // 此标志来操作这个对象的地方，不然会跳过 proxy 的拦截。
  const recorder: Recorder = {
    id: opts.id ?? genRecorderUUID(),
    extra: opts.extra ?? {},
    // @ts-ignore
    ...mitt(),
    ...opts,

    availableStreams: [],
    availableSources: [],
    qualityRetry: opts.qualityRetry ?? 0,
    useServerTimestamp: opts.useServerTimestamp ?? true,
    cookieMode: opts.cookieMode ?? "all",
    state: "idle",
    cache: null as any,
    appendTimeline: null as any,

    getChannelURL() {
      return `https://live.douyin.com/${this.channelId}`;
    },
    checkLiveStatusAndRecord: singleton(checkLiveStatusAndRecord),

    toJSON() {
      return defaultToJSON(provider, this);
    },

    async getLiveInfo() {
      const channelId = this.channelId;
      const info = await getInfo(channelId, {
        auth: this.cookieMode === "danma" ? undefined : this.auth,
        uid: this.uid,
      });
      return {
        channelId,
        ...info,
      };
    },
    async getStream() {
      const res = await getStream({
        channelId: this.channelId,
        quality: this.quality,
        streamPriorities: this.streamPriorities,
        sourcePriorities: this.sourcePriorities,
        strictQuality: false,
        auth: this.cookieMode === "danma" ? undefined : this.auth,
        formatPriorities: this.formatPriorities,
        doubleScreen: this.doubleScreen,
        api: this.api as APIType,
        uid: this.uid,
      });
      return res.currentStream;
    },
  };

  const recorderWithSupportUpdatedEvent = new Proxy(recorder, {
    set(obj, prop, value) {
      Reflect.set(obj, prop, value);

      if (typeof prop === "string") {
        obj.emit("Updated", [prop]);
      }

      return true;
    },
  });

  return recorderWithSupportUpdatedEvent;
}

const ffmpegOutputOptions: string[] = [];
const ffmpegInputOptions: string[] = ["-rw_timeout", "10000000", "-timeout", "10000000"];

const checkLiveStatusAndRecord: Recorder["checkLiveStatusAndRecord"] = async function ({
  getSavePath,
  banLiveId,
  isManualStart,
  streamRetryHint,
}) {
  // 如果已经在录制中,只在需要检查标题关键词时才获取最新信息
  if (this.recordHandle != null) {
    const shouldStop = await utils.checkTitleKeywordsWhileRecording(
      this,
      isManualStart,
      (channelId) =>
        getInfo(channelId, {
          auth: this.cookieMode === "danma" ? undefined : this.auth,
          api: this.api as APIType,
          uid: this.uid,
        }),
    );
    if (shouldStop) {
      return null;
    }

    // 已经在录制中，直接返回
    return this.recordHandle;
  }

  // 获取直播间信息
  let isLiveRadio = false;
  try {
    const liveInfo = await getInfo(this.channelId, {
      auth: this.cookieMode === "danma" ? undefined : this.auth,
      api: this.api as APIType,
      uid: this.uid,
    });
    this.liveInfo = liveInfo;
    // 缓存本房间主播档案，供 PK 时补全名称与主页
    rememberAnchor({
      uid: liveInfo.ownerId,
      name: liveInfo.owner,
      secUid: liveInfo.uid,
    });
    isLiveRadio = liveInfo.isLiveRadio;
    this.emit("stateChange", { state: "idle" });
  } catch (error) {
    this.emit("stateChange", {
      state: "check-error",
      msg: `检查失败，` + (error instanceof Error ? error.message : String(error)),
    });
    throw error;
  }

  if (this.liveInfo.liveId && this.liveInfo.liveId === banLiveId) {
    this.tempStopIntervalCheck = true;
  } else {
    this.tempStopIntervalCheck = false;
  }
  if (this.tempStopIntervalCheck) return null;
  if (!this.liveInfo.living) return null;

  // 检查标题是否包含关键词
  if (utils.checkTitleKeywordsBeforeRecord(this.liveInfo.title, this, isManualStart)) return null;

  const qualityRetryLeft = (await this.cache.get("qualityRetryLeft")) ?? this.qualityRetry;
  const strictQuality = utils.shouldUseStrictQuality(
    qualityRetryLeft,
    this.qualityRetry,
    isManualStart,
  );

  let res: Awaited<ReturnType<typeof getStream>>;
  try {
    res = await getStream({
      channelId: this.channelId,
      quality: this.quality,
      streamPriorities: this.streamPriorities,
      sourcePriorities: this.sourcePriorities,
      strictQuality: strictQuality,
      auth: this.cookieMode === "danma" ? undefined : this.auth,
      formatPriorities: this.formatPriorities,
      doubleScreen: this.doubleScreen,
      api: this.api as APIType,
      uid: this.uid,
      isLiveRadio: isLiveRadio,
      preferAlternativeStream:
        streamRetryHint?.preferAlternativeStream === true &&
        streamRetryHint.liveId === this.liveInfo.liveId,
    });
    this.liveInfo.owner = res.owner;
    this.liveInfo.title = res.title;
    this.liveInfo.cover = res.cover;
    this.liveInfo.liveId = res.liveId;
    this.liveInfo.avatar = res.avatar;
    this.liveInfo.ownerId = res.ownerId;

    // 再检查一次，上一个接口可能不存在标题参数
    if (utils.checkTitleKeywordsBeforeRecord(this.liveInfo.title, this, isManualStart)) return null;
  } catch (err) {
    if (qualityRetryLeft > 0) await this.cache.set("qualityRetryLeft", qualityRetryLeft - 1);

    this.emit("stateChange", {
      state: "check-error",
      msg: `检查失败，` + (err instanceof Error ? err.message : String(err)),
    });
    throw err;
  }
  const { owner, title, liveStartTime, recordStartTime } = this.liveInfo;

  this.emit("stateChange", { state: "recording" });
  const { currentStream: stream, sources: availableSources, streams: availableStreams } = res;
  this.availableStreams = availableStreams.map((s) => s.desc);
  this.availableSources = availableSources.map((s) => s.name);
  this.usedStream = stream.name;
  this.usedSource = stream.source;

  let isEnded = false;
  const onEnd = (...args: unknown[]) => {
    if (isEnded) return;
    isEnded = true;
    this.emit("DebugLog", {
      type: "common",
      text: `record end, reason: ${JSON.stringify(args, (_, v) => (v instanceof Error ? v.stack : v))}`,
    });
    const reason = args[0] instanceof Error ? args[0].message : String(args[0]);
    this.recordHandle?.stop(reason);
  };

  const downloader = createDownloader(
    this.recorderType,
    {
      url: stream.url,
      outputOptions: ffmpegOutputOptions,
      inputOptions: ffmpegInputOptions,
      segment: this.segment ?? 0,
      getSavePath: (opts) =>
        getSavePath({
          owner,
          title: opts.title ?? title,
          startTime: opts.startTime,
          liveStartTime: liveStartTime,
          recordStartTime,
          extraMs: opts.extraMs,
        }),
      disableDanma: this.disableProvideCommentsWhenRecording,
      videoFormat: this.videoFormat ?? "auto",
      debugLevel: this.debugLevel ?? "none",
      onlyAudio: stream.onlyAudio,
      headers: {
        Origin: "https://live.douyin.com",
        Referer: "https://live.douyin.com/",
        // Cookie: this.auth,
      },
      proxy: this.proxy,
    },
    onEnd,
    async () => {
      const info = await getInfo(this.channelId, {
        auth: this.cookieMode === "danma" ? undefined : this.auth,
      });
      return info;
    },
  );

  const handleVideoCreated = async ({ filename, title, cover, rawFilename }) => {
    this.emit("videoFileCreated", { filename, cover, rawFilename });

    if (title && this?.liveInfo) {
      this.liveInfo.title = title;
    }
    if (cover && this?.liveInfo) {
      this.liveInfo.cover = cover;
    }
    const extraDataController = downloader.getExtraDataController();
    extraDataController?.setMeta({
      room_id: this.channelId,
      platform: provider?.id,
      // liveStartTimestamp: liveInfo.startTime?.getTime(),
      // recordStopTimestamp: Date.now(),
      title: title,
      user_name: owner,
    });
  };
  downloader.on("videoFileCreated", handleVideoCreated);
  downloader.on("videoFileCompleted", (data) => {
    this.emit("videoFileCompleted", data);
  });
  downloader.on("DebugLog", (data) => {
    this.emit("DebugLog", data);
  });
  downloader.on("progress", (progress) => {
    if (this.recordHandle) {
      this.recordHandle.progress = progress;
    }
    this.emit("progress", progress);
  });

  // 礼物消息缓存管理
  const giftMessageCache = new Map<
    string,
    {
      gift: GiveGift;
      timer: NodeJS.Timeout;
    }
  >();

  // 礼物延迟处理时间(毫秒),可根据实际情况调整
  const GIFT_DELAY = 5000;

  const client = new DouYinDanmaClient(this?.liveInfo?.liveId as string, {
    cookie: this.cookieMode === "stream" ? undefined : this.auth,
    // 排查 PK 等消息时，设置环境变量 DOUYIN_DEBUG_METHOD=1 可打印未处理的 method
    debugMethod: process.env.DOUYIN_DEBUG_METHOD === "1",
  });
  console.log("DouYinDanmaClient", this?.liveInfo?.liveId, this.cookieMode, this.auth);
  client.on("chat", (msg) => {
    const extraDataController = downloader.getExtraDataController();
    if (!extraDataController) return;
    let timestamp: number = Date.now();
    if (this.useServerTimestamp && msg.eventTime) {
      // 某些消息可能没有 eventTime 字段
      timestamp = Number(msg.eventTime) * 1000;
    }
    const comment: Comment = {
      type: "comment",
      timestamp: timestamp,
      text: msg.content,
      color: "#ffffff",
      sender: {
        uid: msg.user.id,
        name: msg.user.nickName,
        // avatar: msg.user.AvatarThumb.urlListList[0],
        // extra: {
        //   level: msg.level,
        // },
      },
    };
    this.emit("Message", comment);
    extraDataController.addMessage(comment);
  });
  client.on("privilegeScreenChat", (msg) => {
    const extraDataController = downloader.getExtraDataController();
    if (!extraDataController) return;
    const comment: Comment = {
      type: "comment",
      // 抖音飘屏没有时间戳数据，默认使用当前时间
      timestamp: Date.now(),
      text: msg.content,
      color: "#e0c39c",
      sender: {
        uid: msg.user.id,
        name: msg.user.nickName,
      },
    };
    this.emit("Message", comment);
    extraDataController.addMessage(comment);
  });
  client.on("screenChat", (msg) => {
    const extraDataController = downloader.getExtraDataController();
    if (!extraDataController) return;
    const comment: Comment = {
      type: "comment",
      timestamp: this.useServerTimestamp ? Number(msg.eventTime) / 1000000 : Date.now(),
      text: msg.content,
      color: "#d7f6fc",
      sender: {
        uid: msg.user.id,
        name: msg.user.nickName,
      },
    };
    this.emit("Message", comment);
    extraDataController.addMessage(comment);
  });
  client.on("gift", (msg) => {
    const extraDataController = downloader.getExtraDataController();
    if (!extraDataController) return;
    if (this.saveGiftDanma === false) return;

    const serverTimestamp =
      Number(msg.common.createTime) > 9999999999
        ? Number(msg.common.createTime)
        : Number(msg.common.createTime) * 1000;

    const gift: GiveGift = {
      type: "give_gift",
      timestamp: this.useServerTimestamp ? serverTimestamp : Date.now(),
      name: msg.gift.name,
      price: msg.gift.diamondCount / 10 || 0,
      count: Number(msg.totalCount ?? 1),
      color: "#ffffff",
      sender: {
        uid: msg.user.id,
        name: msg?.user?.nickName || "unknown",
        // avatar: msg.ic,
        // extra: {
        //   level: msg.level,
        // },
      },
    };

    // 单独使用groupId并不可靠
    const groupId = `${msg.groupId}_${msg.user.id}_${msg.giftId}`;

    // 如果已存在相同 groupId 的礼物,清除旧的定时器
    const existing = giftMessageCache.get(groupId);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // 创建新的定时器
    const timer = setTimeout(() => {
      const cachedGift = giftMessageCache.get(groupId);
      if (cachedGift) {
        // 延迟时间到,添加最终的礼物消息
        this.emit("Message", cachedGift.gift);
        extraDataController.addMessage(cachedGift.gift);
        giftMessageCache.delete(groupId);
      }
    }, GIFT_DELAY);

    // 更新缓存
    giftMessageCache.set(groupId, { gift, timer });
  });
  // PK 比分高频推送，限制最小写入间隔，避免 XML 膨胀
  let lastPkScoreWrite = 0;
  const PK_SCORE_MIN_INTERVAL = 2000;
  // 每局 PK 的起始时间与对手别名：同一对局内别名固定，避免「对方」随排名漂移
  let pkBattleId: string | null = null;
  let pkBattleStartMs = 0;
  const pkOpponentLabels = new Map<string, string>();

  const pkLabelOf = (anchorId?: string | null) => {
    const key = anchorId ?? "unknown";
    const existing = pkOpponentLabels.get(key);
    if (existing) return existing;
    const label = `对手${pkOpponentLabels.size + 1}`;
    pkOpponentLabels.set(key, label);
    return label;
  };

  client.on("pk", (event) => {
    if (this.savePkDanma === false) return;
    const extraDataController = downloader.getExtraDataController();
    if (!extraDataController) return;

    const ownerId = this.liveInfo?.ownerId;
    const matchOwner = (id?: string | null) => !!ownerId && !!id && id === ownerId;

    // 我方主播信息：优先用缓存（含 sec_uid），兜底用配置里的 sec_uid
    const ownProfile = getAnchorProfile(ownerId);
    const ownName = ownProfile?.name || this.liveInfo?.owner;
    const ownHomepage =
      ownProfile?.homepage ?? anchorHomepage(typeof this.uid === "string" ? this.uid : undefined);

    // 新对局：重置对手别名与计时起点
    const battleKey = event.battle_id ?? event.context_battle_id ?? null;
    if (event.type === "start" || (battleKey && battleKey !== pkBattleId)) {
      pkBattleId = battleKey;
      pkBattleStartMs = event.start_time_ms || event.create_time_ms || 0;
      pkOpponentLabels.clear();
    }

    const pkMessage: DouyinPk = {
      type: "douyin_pk",
      timestamp: Date.now(),
      event: event.type,
      battleId: event.battle_id,
      contextBattleId: event.context_battle_id,
      duration: event.duration,
    };
    if (ownName) pkMessage.myName = ownName;
    if (ownHomepage) pkMessage.myHomepage = ownHomepage;

    // 距本局开始的秒数，便于还原「开打多少秒」
    if (event.type === "start") {
      pkMessage.elapsed = 0;
    } else if (pkBattleStartMs > 0 && event.create_time_ms > 0) {
      pkMessage.elapsed = Math.max(
        Math.round((event.create_time_ms - pkBattleStartMs) / 100) / 10,
        0,
      );
    }

    const toUsers = (
      users: { uid: string | null; nickname: string; score: string; rank?: number }[],
    ) =>
      users.map((u) => ({
        uid: u.uid,
        nickname: u.nickname,
        score: u.score,
        rank: u.rank,
      }));

    // 比分：区分我方与所有对手（支持多人 PK）
    const opponents = new Map<string, DouyinPkOpponent>();
    const getOpponent = (anchorId: string | null | undefined) => {
      const key = anchorId ?? "unknown";
      let opp = opponents.get(key);
      if (!opp) {
        const profile = getAnchorProfile(anchorId);
        opp = {
          anchorId,
          label: pkLabelOf(anchorId),
          anchorName: profile?.name,
          homepage: profile?.homepage,
        };
        opponents.set(key, opp);
      }
      return opp;
    };

    if ((event.type === "scores" || event.type === "finish") && event.scores?.length) {
      const mine = event.scores.find((s) => matchOwner(s.anchor_id));
      if (mine) {
        pkMessage.myScore = mine.score;
        pkMessage.myScoreText = mine.score_blur_text || mine.score;
        if (mine.battle_rank > 0) pkMessage.myRank = mine.battle_rank;
      }
      for (const s of event.scores) {
        if (matchOwner(s.anchor_id)) continue;
        const opp = getOpponent(s.anchor_id);
        const profile = getAnchorProfile(s.anchor_id);
        if (profile?.name && !opp.anchorName) opp.anchorName = profile.name;
        if (profile?.homepage && !opp.homepage) opp.homepage = profile.homepage;
        opp.score = s.score;
        opp.scoreText = s.score_blur_text || s.score;
        opp.rank = s.battle_rank;
      }
    }

    // 贡献榜：区分我方与所有对手
    if ((event.type === "armies" || event.type === "finish") && event.anchors?.length) {
      const mine = event.anchors.find((a) => matchOwner(a.anchor_id));
      if (mine) pkMessage.myArmies = toUsers(mine.users);
      for (const a of event.anchors) {
        if (matchOwner(a.anchor_id)) continue;
        const opp = getOpponent(a.anchor_id);
        if (a.users.length > 0) opp.armies = toUsers(a.users);
      }
      const unassigned = (event.unassigned_armies ?? []).flat();
      if (unassigned.length > 0) pkMessage.unassignedArmies = toUsers(unassigned);
    }

    if (opponents.size > 0) {
      const list = [...opponents.values()].sort((a, b) => {
        const rankDiff = (a.rank || 999) - (b.rank || 999);
        if (rankDiff !== 0) return rankDiff;
        return Number(b.score || 0) - Number(a.score || 0);
      });
      pkMessage.opponents = list;
      // 兼容字段：取排名最高、且确实有比分的对手
      const first = list.find((item) => item.score !== undefined) ?? list[0];
      if (first) {
        pkMessage.opponentId = first.anchorId ?? null;
        pkMessage.opponentScore = first.score;
        pkMessage.opponentScoreText = first.scoreText;
        pkMessage.opponentArmies = first.armies;
      }
    }

    // scores 事件限流
    if (event.type === "scores") {
      const now = Date.now();
      if (now - lastPkScoreWrite < PK_SCORE_MIN_INTERVAL) return;
      lastPkScoreWrite = now;
    }

    this.emit("Message", pkMessage);
    extraDataController.addMessage(pkMessage);
  });
  client.on("reconnect", (attempts: number) => {
    this.appendTimeline({ text: `弹幕连接断开，正在重试: ${attempts}` });
    this.emit("DebugLog", {
      type: "common",
      text: `douyin ${this.channelId} danma has reconnect ${attempts}`,
    });
  });
  client.on("error", (err) => {
    this.emit("DebugLog", {
      type: "common",
      text: `douyin ${this.channelId} danma error: ${String(err)}`,
    });
  });
  client.on("init", (url) => {
    this.emit("DebugLog", {
      type: "common",
      text: `douyin ${this.channelId} danma init ${url}`,
    });
  });
  client.on("open", () => {
    this.appendTimeline({ text: `弹幕连接已建立` });
    this.emit("DebugLog", {
      type: "common",
      text: `douyin ${this.channelId} danma open`,
    });
  });
  client.on("close", () => {
    this.emit("DebugLog", {
      type: "common",
      text: `douyin danma close`,
    });
  });

  // client.on("open", () => {
  //   console.log("open");
  // });
  // client.on("close", () => {
  //   console.log("close");
  // });
  // client.on("error", (err) => {
  //   console.log("error", err);
  // });
  // client.on("heartbeat", () => {
  //   // console.log("heartbeat");
  // });

  if (!this.disableProvideCommentsWhenRecording) {
    client.connect();
  }

  const downloaderArgs = downloader.getArguments();
  downloader.run();

  const cut = utils.singleton<RecordHandle["cut"]>(async () => {
    if (!this.recordHandle) return;
    downloader.cut();
  });

  const stop = singleton<RecordHandle["stop"]>(async (reason?: string) => {
    if (!this.recordHandle) return;
    this.emit("stateChange", { state: "stopping-record" });

    try {
      // 清理所有礼物缓存定时器
      for (const [_groupId, cached] of giftMessageCache.entries()) {
        clearTimeout(cached.timer);
        // 立即添加剩余的礼物消息
        const extraDataController = downloader.getExtraDataController();
        if (extraDataController) {
          this.emit("Message", cached.gift);
          extraDataController.addMessage(cached.gift);
        }
      }
      giftMessageCache.clear();

      client.close();
      await downloader.stop();
    } catch (err) {
      this.emit("DebugLog", {
        type: "common",
        text: `stop record error: ${String(err)}`,
      });
    }
    this.usedStream = undefined;
    this.usedSource = undefined;
    this.emit("RecordStop", { recordHandle: this.recordHandle, reason });
    this.recordHandle = undefined;
    this.liveInfo = undefined;
    this.emit("stateChange", { state: "idle" });
    this.cache.set("qualityRetryLeft", this.qualityRetry);
  });

  this.recordHandle = {
    id: genRecordUUID(),
    stream: stream.name,
    source: stream.source,
    recorderType: downloader.type,
    url: stream.url,
    downloaderArgs,
    savePath: downloader.videoFilePath,
    stop,
    cut,
  };
  this.emit("RecordStart", this.recordHandle);

  return this.recordHandle;
};

export {
  anchorHomepage,
  getAnchorProfile,
  normalizeHomepage,
  parseSecUid,
  rememberAnchor,
  setAnchorProfiles,
} from "./anchor.js";
export type { AnchorProfile, AnchorProfileInput } from "./anchor.js";

export const provider: RecorderProvider<{}> = {
  id: "DouYin",
  name: "抖音",
  siteURL: "https://live.douyin.com/",

  matchURL(channelURL) {
    // 支持 v.douyin.com 和 live.douyin.com
    return /https?:\/\/(live|v|www)\.douyin\.com\//.test(channelURL);
  },

  async resolveChannelInfoFromURL(channelURL) {
    if (!this.matchURL(channelURL)) return null;

    let id: string;
    if (channelURL.includes("v.douyin.com")) {
      // 处理短链接
      try {
        id = await resolveShortURL(channelURL);
      } catch (err: any) {
        throw new Error(`解析抖音短链接失败: ${err?.message}`);
      }
    } else if (channelURL.includes("/user/")) {
      // 解析用户主页
      id = await parseUser(channelURL);
      if (!id) {
        throw new Error(`解析抖音用户主页失败`);
      }
    } else {
      // 处理常规直播链接
      id = path.basename(new URL(channelURL).pathname);
    }
    const info = await getInfo(id);

    return {
      id: info.roomId,
      title: info.title,
      owner: info.owner,
      avatar: info.avatar,
      uid: info.uid,
    };
  },

  createRecorder(opts) {
    return createRecorder({ providerId: provider.id, ...opts });
  },

  fromJSON(recorder) {
    return defaultFromJSON(this, recorder);
  },

  setFFMPEGOutputArgs(args) {
    ffmpegOutputOptions.splice(0, ffmpegOutputOptions.length, ...args);
  },
};
