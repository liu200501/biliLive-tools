/**
 * XML流式写入控制器，用于实时写入弹幕、礼物等信息到XML文件
 * 相比原有的json方案，这个实现每隔10秒就会写入数据，减少内存占用和数据丢失风险
 */
import fs from "node:fs";
import { XMLBuilder } from "fast-xml-parser";
import { pick } from "lodash-es";

import { Message } from "./common.js";

const METADATA_PLACEHOLDER = "<!--METADATA_PLACEHOLDER-->";
const XML_FILE_HEADER = `<?xml version="1.0" encoding="utf-8"?>\n<?xml-stylesheet type="text/xsl" href="#s"?>\n<i>\n${METADATA_PLACEHOLDER}\n<RecorderXmlStyle><z:stylesheet version="1.0" id="s" xml:id="s" xmlns:z="http://www.w3.org/1999/XSL/Transform"><z:output method="html"/><z:template match="/"><html><meta name="viewport" content="width=device-width"/><title>弹幕文件 <z:value-of select="/i/metadata/user_name/text()"/></title><style>body{margin:0}h1,h2,p,table{margin-left:5px}table{border-spacing:0}td,th{border:1px solid grey;padding:1px 5px}th{position:sticky;top:0;background:#4098de}tr:hover{background:#d9f4ff}div{overflow:auto;max-height:80vh;max-width:100vw;width:fit-content}</style><h1>弹幕XML文件</h1><p>本文件不支持在 IE 浏览器里预览，请使用 Chrome Firefox Edge 等浏览器。</p><p>文件用法参考文档 <a href="https://rec.danmuji.org/user/danmaku/">https://rec.danmuji.org/user/danmaku/</a></p><table><tr><td>房间号</td><td><z:value-of select="/i/metadata/room_id/text()"/></td></tr><tr><td>主播名</td><td><z:value-of select="/i/metadata/user_name/text()"/></td></tr><tr><td><a href="#d">弹幕</a></td><td>共<z:value-of select="count(/i/d)"/>条记录</td></tr><tr><td><a href="#guard">上船</a></td><td>共<z:value-of select="count(/i/guard)"/>条记录</td></tr><tr><td><a href="#sc">SC</a></td><td>共<z:value-of select="count(/i/sc)"/>条记录</td></tr><tr><td><a href="#gift">礼物</a></td><td>共<z:value-of select="count(/i/gift)"/>条记录</td></tr><tr><td><a href="#pk">PK</a></td><td>共<z:value-of select="count(/i/pk)"/>条记录</td></tr><tr><td><a href="#douyin_pk">抖音PK</a></td><td>共<z:value-of select="count(/i/douyin_pk)"/>条记录</td></tr></table><h2 id="d">弹幕</h2><div id="dm"><table><tr><th>用户名</th><th>出现时间</th><th>用户ID</th><th>弹幕</th><th>参数</th></tr><z:for-each select="/i/d"><tr><td><z:value-of select="@user"/></td><td></td><td></td><td><z:value-of select="."/></td><td><z:value-of select="@p"/></td></tr></z:for-each></table></div><script>Array.from(document.querySelectorAll('#dm tr')).slice(1).map(t=>t.querySelectorAll('td')).forEach(t=>{let p=t[4].textContent.split(','),a=p[0];t[1].textContent=\`\u0024{(Math.floor(a/60/60)+'').padStart(2,0)}:\u0024{(Math.floor(a/60%60)+'').padStart(2,0)}:\u0024{(a%60).toFixed(3).padStart(6,0)}\`;t[2].innerHTML=\`&lt;a target=_blank rel="nofollow noreferrer" "&gt;\u0024{p[6]}&lt;/a&gt;\`})</script><h2 id="guard">舰长购买</h2><div><table><tr><th>用户名</th><th>用户ID</th><th>舰长等级</th><th>购买数量</th><th>出现时间</th></tr><z:for-each select="/i/guard"><tr><td><z:value-of select="@user"/></td><td><a rel="nofollow noreferrer"><z:attribute name="href"><z:text></z:text><z:value-of select="@uid" /></z:attribute><z:value-of select="@uid"/></a></td><td><z:value-of select="@level"/></td><td><z:value-of select="@count"/></td><td><z:value-of select="@ts"/></td></tr></z:for-each></table></div><h2 id="sc">SuperChat 醒目留言</h2><div><table><tr><th>用户名</th><th>用户ID</th><th>内容</th><th>显示时长</th><th>价格</th><th>出现时间</th></tr><z:for-each select="/i/sc"><tr><td><z:value-of select="@user"/></td><td><a rel="nofollow noreferrer"><z:attribute name="href"><z:text></z:text><z:value-of select="@uid" /></z:attribute><z:value-of select="@uid"/></a></td><td><z:value-of select="."/></td><td><z:value-of select="@time"/></td><td><z:value-of select="@price"/></td><td><z:value-of select="@ts"/></td></tr></z:for-each></table></div><h2 id="gift">礼物</h2><div><table><tr><th>用户名</th><th>用户ID</th><th>礼物名</th><th>礼物数量</th><th>出现时间</th></tr><z:for-each select="/i/gift"><tr><td><z:value-of select="@user"/></td><td><span rel="nofollow noreferrer"><z:attribute name="href"></z:attribute><z:value-of select="@uid"/></span></td><td><z:value-of select="@giftname"/></td><td><z:value-of select="@giftcount"/></td><td><z:value-of select="@ts"/></td></tr></z:for-each></table></div><h2 id="pk">PK</h2><div><table><tr><th>状态</th><th>对手</th><th>出现时间</th></tr><z:for-each select="/i/pk"><tr><td><z:value-of select="@status"/></td><td><z:value-of select="@opponent"/></td><td><z:value-of select="@ts"/></td></tr></z:for-each></table></div><h2 id="douyin_pk">抖音 PK</h2><p class="pk-note">按对局分组 · 时间=距录制开始 · PK用时=距本局开始</p><div><table class="pktable"><tr><th>时间</th><th>PK用时</th><th>事件</th><th>我方PK值</th><th>差距</th><th>对手</th><th>贡献榜</th></tr><z:for-each select="/i/douyin_pk"><tr class="pkrow" data-battle="{@battle_id}" data-event="{@event}" data-ts="{@ts}" data-pkt="{@pkt}" data-dur="{@duration}" data-diff="{@diff}" data-mine="{@my_score}" data-opp="{@opponent_score}"><td class="pk-time"><z:value-of select="@ts"/></td><td class="pk-pkt"><z:value-of select="@pkt"/></td><td class="pk-ev"><z:value-of select="@event"/></td><td class="pk-mine"><z:value-of select="@my_score_text"/><z:if test="not(string(@my_score_text))"><z:value-of select="@my_score"/></z:if></td><td class="pk-diff"><z:value-of select="@diff"/></td><td class="pk-opp"><z:value-of select="@opponents_readable"/><z:if test="not(string(@opponents_readable))"><z:value-of select="@opponents"/></z:if></td><td class="pk-army"><z:if test="string(@my_armies)">我: </z:if><z:value-of select="@my_armies"/><z:if test="string(@my_armies) and string(@opponent_armies)"> / 对: </z:if><z:value-of select="@opponent_armies"/></td></tr></z:for-each></table></div><style>.pk-note{margin:0 5px 6px;font-size:12px;color:#666}.pktable{table-layout:auto}.pkrow td{white-space:nowrap}.pk-ev{font-weight:500}.pk-mine{font-weight:500}.pk-diff.pos{color:#0f6e56}.pk-diff.neg{color:#a32d2d}.grouphdr td{background:#eef4fb;color:#1f3a5f;font-weight:500}.pk-finish td{background:#fff8ec}</style><script>(function(){var t=document.querySelector('.pktable');if(!t){return}var rows=[].slice.call(t.querySelectorAll('tr.pkrow'));if(rows.length===0){return}var NAME={start:'开始',status:'状态',scores:'比分',armies:'贡献榜',finish:'结束'};function p2(n){var s=String(Math.floor(n));return s.length===1?'0'+s:s}function hms(v){var s=Math.floor(Number(v)||0);return p2(s/3600)+':'+p2(s%3600/60)+':'+p2(s%60)}function ms(v){var s=Math.floor(Number(v)||0);return Math.floor(s/60)+':'+p2(s%60)}var last=null;rows.forEach(function(r){var b=r.getAttribute('data-battle')||'';if(b!==last){last=b;var h=document.createElement('tr');h.className='grouphdr';var c=document.createElement('td');c.colSpan=7;var dur=r.getAttribute('data-dur');var label=b?('对局 '+b):'对局（未关联 battle_id）';c.textContent=dur?(label+' · 时长 '+ms(dur)):label;h.appendChild(c);r.parentNode.insertBefore(h,r)}var ev=r.getAttribute('data-event')||'';var te=r.querySelector('.pk-time');if(te){te.textContent=hms(r.getAttribute('data-ts'))}var tp=r.querySelector('.pk-pkt');if(tp){var pv=r.getAttribute('data-pkt');tp.textContent=pv?ms(pv):''}var tv=r.querySelector('.pk-ev');if(tv){tv.textContent=NAME[ev]||ev}var tm=r.querySelector('.pk-mine');if(tm){if(tm.textContent===''){tm.textContent='—'}}var dc=r.querySelector('.pk-diff');if(dc){var dv=r.getAttribute('data-diff');if(!dv){var dm=r.getAttribute('data-mine');var dopp=r.getAttribute('data-opp');if(dm!==''&amp;&amp;dopp!==''){dv=String(Number(dm)-Number(dopp))}}var n=Number(dv);if(dv&amp;&amp;!isNaN(n)){if(n===0){dc.textContent='持平'}else{dc.textContent=(n>0?'+':'')+n.toLocaleString();dc.className=n>0?'pk-diff pos':'pk-diff neg'}}}if(ev==='finish'){r.className=r.className+' pk-finish'}})}());</script></html></z:template></z:stylesheet></RecorderXmlStyle>\n`;
const DANMA_STATS_INTERVAL = 10;

export interface DanmaStatsPayload {
  danmaTimeline: {
    interval: number;
    data: number[];
  };
}

export interface XmlStreamStats {
  danmaNum: number;
  uniqMember: number;
  scNum: number;
  guardNum: number;
  pkNum: number;
  danmaStats: DanmaStatsPayload;
}

export interface XmlStreamData {
  header: string;
  meta: {
    title?: string;
    recordStartTimestamp: number;
    recordStopTimestamp?: number;
    liveStartTimestamp?: number;
    downloaderArgs?: string[];
    platform?: string;
    user_name?: string;
    room_id?: string;
  };
  /** 缓存的消息，待写入到文件 */
  pendingMessages: Message[];
}

export interface XmlStreamController {
  /** 设计上来说，外部程序不应该能直接修改 data 上的东西 */
  readonly data: XmlStreamData;
  addMessage: (message: Message) => void;
  setMeta: (meta: Partial<XmlStreamData["meta"]>) => Promise<void>;
  flush: () => Promise<void>;
  getStats: () => XmlStreamStats;
}

type DouyinPkMessage = Extract<Message, { type: "douyin_pk" }>;
type PkArmyUser = { uid?: string | null; nickname: string; score: string; rank?: number };

const pad2 = (value: number) => String(value).padStart(2, "0");

function formatDuration(seconds: number): string {
  const total = Math.max(Math.floor(seconds), 0);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

function formatClock(seconds: number): string {
  const total = Math.max(Math.floor(seconds), 0);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
  ].join(" ");
}

/** 主播展示名：有主页链接时渲染成 Markdown 链接，有 uid 时附在后面 */
function anchorLabel(
  name: string,
  options: { homepage?: string; uid?: string | null } = {},
): string {
  const text = options.homepage ? `[${name}](${options.homepage})` : name;
  const uid = options.uid?.trim();
  if (!uid) return text;
  // 没有昵称时 label 就是 uid，避免出现「92688084797 · `92688084797`」
  if (uid === name.trim()) return `\`${uid}\``;
  return `${text} · \`${uid}\``;
}

/**
 * 我方名次：优先用报文里的 battle_rank，缺失时按最终比分推算。
 * 老版本记录没有 my_rank 字段，靠这里补出来。
 */
function resolveMyRank(
  battle: PkBattle,
  anchors: PkAnchorStat[],
  myScore: number,
): number | undefined {
  if (battle.myRank !== undefined) return battle.myRank;
  if (battle.myScore === undefined) return undefined;
  return 1 + anchors.filter((anchor) => anchor.score > myScore).length;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "0";
}

function scoreLabel(score?: string, text?: string): string {
  const value = Number(score ?? text);
  const raw = text ?? score;
  // 抖音的模糊文案（如「13.1万」）优先；纯数字则补千分位
  if (text && !/^\d+$/.test(text)) return text;
  if (raw !== undefined && Number.isFinite(value)) return formatNumber(value);
  return raw ?? "-";
}

function scoreBar(value: number, max: number, width = 18): string {
  if (max <= 0) return "";
  const ratio = Math.min(value / max, 1);
  const filled = Math.max(value > 0 ? 1 : 0, Math.round(ratio * width));
  const bar = "█".repeat(filled) + "░".repeat(Math.max(width - filled, 0));
  return `${bar} ${Math.round(ratio * 100)}%`;
}

interface PkAnchorStat {
  anchorId: string | null;
  label: string;
  homepage?: string;
  score: number;
  scoreText?: string;
  rank?: number;
}

interface PkArmyStat {
  side: "mine" | "opponent" | "unassigned";
  anchorId: string | null;
  users: PkArmyUser[];
}

interface PkSample {
  elapsed?: number;
  timestamp: number;
  myScore?: number;
  values: Map<string, number>;
}

interface PkBattle {
  id: string;
  start: number;
  duration?: number;
  myScore?: string;
  myScoreText?: string;
  myRank?: number;
  myName?: string;
  myHomepage?: string;
  anchors: Map<string, PkAnchorStat>;
  armies: Map<string, PkArmyStat>;
  samples: PkSample[];
}

function collectPkBattles(messages: DouyinPkMessage[]): PkBattle[] {
  const battles = new Map<string, PkBattle>();

  const ensure = (id: string, timestamp: number) => {
    let battle = battles.get(id);
    if (!battle) {
      battle = {
        id,
        start: timestamp,
        anchors: new Map(),
        armies: new Map(),
        samples: [],
      };
      battles.set(id, battle);
    }
    battle.start = Math.min(battle.start, timestamp);
    return battle;
  };

  for (const message of messages) {
    const battle = ensure(
      message.battleId || message.contextBattleId || "unknown",
      message.timestamp,
    );
    if (message.duration !== undefined) battle.duration = message.duration;
    if (message.myScore !== undefined) {
      battle.myScore = message.myScore;
      battle.myScoreText = message.myScoreText;
    }
    if (message.myRank !== undefined) battle.myRank = message.myRank;
    if (message.myName) battle.myName = message.myName;
    if (message.myHomepage) battle.myHomepage = message.myHomepage;

    for (const opponent of message.opponents ?? []) {
      const key = opponent.anchorId ?? opponent.label ?? `unknown-${battle.anchors.size}`;
      const previous = battle.anchors.get(key);
      const score = opponent.score !== undefined ? Number(opponent.score) : previous?.score;
      if (score === undefined && !opponent.armies?.length) continue;
      battle.anchors.set(key, {
        anchorId: opponent.anchorId ?? null,
        label: opponent.anchorName || opponent.label || opponent.anchorId || "对手",
        homepage: opponent.homepage ?? previous?.homepage,
        score: score !== undefined && Number.isFinite(score) ? score : 0,
        scoreText: opponent.scoreText ?? previous?.scoreText,
        rank: opponent.rank ?? previous?.rank,
      });
    }

    if (message.myArmies?.length) {
      battle.armies.set("mine", { side: "mine", anchorId: null, users: message.myArmies });
    }
    let hasOpponentArmies = false;
    for (const opponent of message.opponents ?? []) {
      if (opponent.armies?.length) {
        hasOpponentArmies = true;
        battle.armies.set(`opp:${opponent.anchorId ?? opponent.label ?? "unknown"}`, {
          side: "opponent",
          anchorId: opponent.anchorId ?? null,
          users: opponent.armies,
        });
      }
    }
    // 兼容只写了 opponentArmies（单对手）的消息
    if (!hasOpponentArmies && message.opponentArmies?.length) {
      battle.armies.set(`opp:${message.opponentId ?? "unknown"}`, {
        side: "opponent",
        anchorId: message.opponentId ?? null,
        users: message.opponentArmies,
      });
    }
    if (message.unassignedArmies?.length) {
      battle.armies.set("unassigned", {
        side: "unassigned",
        anchorId: null,
        users: message.unassignedArmies,
      });
    }

    if (message.event === "scores" || message.event === "finish") {
      const values = new Map<string, number>();
      for (const opponent of message.opponents ?? []) {
        if (opponent.score !== undefined) {
          values.set(opponent.anchorId ?? opponent.label ?? "unknown", Number(opponent.score));
        }
      }
      battle.samples.push({
        elapsed: message.elapsed,
        timestamp: message.timestamp,
        myScore: message.myScore !== undefined ? Number(message.myScore) : undefined,
        values,
      });
    }
  }

  return [...battles.values()].sort((a, b) => a.start - b.start);
}

function thinSamples<T>(items: T[], limit = 24): T[] {
  if (items.length <= limit) return items;
  const stride = Math.ceil(items.length / limit);
  const result = items.filter((_, index) => index % stride === 0);
  const last = items[items.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

/**
 * 生成 PK 战报 Markdown：按对局聚合，含总览、比分、助力榜、比分曲线。
 * 无 PK 数据时返回空字符串。
 */
export function buildPkMarkdown(meta: XmlStreamData["meta"], messages: DouyinPkMessage[]): string {
  const battles = collectPkBattles(messages);
  if (battles.length === 0) return "";

  const lines: string[] = [];
  lines.push(`# 抖音 PK 战报${meta.user_name ? ` · ${meta.user_name}` : ""}`, "");
  lines.push(
    `> 由 biliLive-tools 自动生成 · 共 ${battles.length} 局 · ${messages.length} 条 PK 事件`,
    "",
  );
  lines.push("| 项目 | 值 |", "| --- | --- |");
  const ownHomepage = battles.find((battle) => battle.myHomepage)?.myHomepage;
  const ownName = meta.user_name ?? battles.find((battle) => battle.myName)?.myName;
  lines.push(`| 主播 | ${ownName ? anchorLabel(ownName, { homepage: ownHomepage }) : "-"} |`);
  lines.push(`| 房间号 | ${meta.room_id ?? "-"} |`);
  lines.push(`| 录制开始 | ${formatDateTime(meta.recordStartTimestamp)} |`);
  if (meta.recordStopTimestamp) {
    lines.push(`| 录制结束 | ${formatDateTime(meta.recordStopTimestamp)} |`);
  }
  lines.push("", "## 总览", "");
  lines.push(
    "| # | 开始 | 时长 | 我方排名 | 我方 PK 值 | 第一名 |",
    "| ---: | --- | ---: | ---: | ---: | --- |",
  );

  for (const [index, battle] of battles.entries()) {
    const anchors = [...battle.anchors.values()].sort(
      (a, b) => (a.rank || 999) - (b.rank || 999) || b.score - a.score,
    );
    const top = anchors[0];
    const offset = (battle.start - meta.recordStartTimestamp) / 1000;
    const overviewMyScore = Number(battle.myScore ?? 0);
    const overviewMyRank = resolveMyRank(battle, anchors, overviewMyScore);
    lines.push(
      `| ${index + 1} | ${formatClock(offset)} | ${
        battle.duration ? formatDuration(battle.duration) : "-"
      } | ${overviewMyRank ?? "-"} | ${scoreLabel(battle.myScore, battle.myScoreText)} | ${
        top
          ? `${anchorLabel(top.label, { homepage: top.homepage })}（${scoreLabel(String(top.score), top.scoreText)}）`
          : "-"
      } |`,
    );
  }

  for (const [index, battle] of battles.entries()) {
    const anchors = [...battle.anchors.values()].sort(
      (a, b) => (a.rank || 999) - (b.rank || 999) || b.score - a.score,
    );
    const myScore = Number(battle.myScore ?? 0);
    const max = Math.max(myScore, ...anchors.map((a) => a.score), 0);
    const offset = (battle.start - meta.recordStartTimestamp) / 1000;
    const top = anchors[0];
    const gap = top ? myScore - top.score : 0;
    const myRank = resolveMyRank(battle, anchors, myScore);

    lines.push("", `## 第 ${index + 1} 局`, "", `\`${battle.id}\``, "");
    lines.push("| 指标 | 值 |", "| --- | --- |");
    lines.push(`| 开始 | ${formatClock(offset)}（${formatDateTime(battle.start)}） |`);
    lines.push(`| 时长 | ${battle.duration ? formatDuration(battle.duration) : "-"} |`);
    lines.push(`| 参与主播 | ${anchors.length + 1} 人 |`);
    const myLabel = battle.myName
      ? ` · ${anchorLabel(battle.myName, { homepage: battle.myHomepage })}`
      : "";
    lines.push(
      `| 我方 | 第 ${myRank ?? "-"} 名 · **${scoreLabel(battle.myScore, battle.myScoreText)}**${myLabel} |`,
    );
    if (battle.myScore !== undefined && top) {
      const result =
        gap === 0
          ? "持平"
          : gap > 0
            ? `领先 ${formatNumber(gap)}`
            : `落后 ${formatNumber(Math.abs(gap))}`;
      lines.push(`| 与第一名差距 | ${result} |`);
    }
    lines.push("", "### 最终比分", "");
    lines.push("| 名次 | 主播 | PK 值 | 相对最高 |", "| ---: | --- | ---: | --- |");

    const rows = [
      ...anchors.map((anchor) => ({
        rank: anchor.rank ?? 0,
        label: anchor.label,
        id: anchor.anchorId,
        homepage: anchor.homepage,
        score: anchor.score,
        text: anchor.scoreText,
        mine: false,
      })),
      {
        rank: myRank ?? 0,
        label: battle.myName || "我方",
        id: null as string | null,
        homepage: battle.myHomepage,
        score: myScore,
        text: battle.myScoreText,
        mine: true,
      },
    ].sort((a, b) => (a.rank || 999) - (b.rank || 999) || b.score - a.score);

    for (const row of rows) {
      const name = row.mine
        ? `**${anchorLabel(row.label, { homepage: row.homepage })}**`
        : anchorLabel(row.label, { homepage: row.homepage, uid: row.id });
      lines.push(
        `| ${row.rank || "-"} | ${name} | ${
          row.mine ? scoreLabel(battle.myScore, row.text) : scoreLabel(String(row.score), row.text)
        } | ${scoreBar(row.score, max)} |`,
      );
    }

    lines.push("", "### 助力榜（快照）", "");
    const armyRows: { owner: string; homepage?: string; rank?: number; user: PkArmyUser }[] = [];
    // 先我方、再按最终名次的对手、最后未归属，避免不同主播的用户交错
    const order = [
      "mine",
      ...anchors.map((anchor) => `opp:${anchor.anchorId ?? anchor.label}`),
      "unassigned",
    ];
    const armyKeys = [...order, ...[...battle.armies.keys()].filter((key) => !order.includes(key))];
    for (const key of armyKeys) {
      const army = battle.armies.get(key);
      if (!army) continue;
      let owner = battle.myName || "我方";
      let ownerHomepage = battle.myHomepage;
      if (army.side === "opponent") {
        const matched = anchors.find((anchor) => anchor.anchorId === army.anchorId);
        owner = matched?.label ?? (army.anchorId ? `ID ${army.anchorId}` : "对手");
        ownerHomepage = matched?.homepage;
      } else if (army.side === "unassigned") {
        owner = "未归属";
        ownerHomepage = undefined;
      }
      const users = [...army.users].sort(
        (a, b) => (a.rank || 999) - (b.rank || 999) || Number(b.score) - Number(a.score),
      );
      for (const [userIndex, user] of users.entries()) {
        armyRows.push({
          owner,
          homepage: ownerHomepage,
          rank: user.rank ?? userIndex + 1,
          user,
        });
      }
    }
    if (armyRows.length === 0) {
      lines.push("> 本局未收到助力榜快照。");
    } else {
      lines.push("| 主播 | 名次 | 用户 | 用户 ID | 分值 |", "| --- | ---: | --- | --- | ---: |");
      for (const row of armyRows) {
        lines.push(
          `| ${row.owner} | ${row.rank || "-"} | ${row.user.nickname || "匿名"} | ${
            row.user.uid ?? "-"
          } | ${scoreLabel(row.user.score)} |`,
        );
      }
    }

    if (battle.samples.length > 0) {
      lines.push("", "### 比分曲线", "");
      const header = ["PK用时", "我方", ...anchors.map((a) => a.label)];
      lines.push(
        `| ${header.join(" | ")} |`,
        `| ---: |${header
          .slice(1)
          .map(() => " ---: |")
          .join("")}`,
      );
      for (const sample of thinSamples(battle.samples)) {
        const elapsed =
          sample.elapsed !== undefined
            ? formatDuration(sample.elapsed)
            : formatDuration((sample.timestamp - battle.start) / 1000);
        const cells = anchors.map((anchor) => {
          const value = sample.values.get(anchor.anchorId ?? anchor.label);
          return value === undefined ? "-" : formatNumber(value);
        });
        lines.push(
          `| ${elapsed} | ${sample.myScore !== undefined ? formatNumber(sample.myScore) : "-"} | ${cells.join(" | ")} |`,
        );
      }
    }
  }

  lines.push(
    "",
    "---",
    "",
    "**说明**",
    "",
    "- 助力榜来自抖音推送的部分快照（通常为每名主播前 3 名），不是完整榜单。",
    "- 抖音 PK 消息本身只下发主播 ID，昵称与主页链接来自本机已解析过的直播间信息；未解析过的对手仅显示 ID。",
    "- `rank_list_v2` 玩法暂未解析，特殊 PK 玩法可能缺少数据。",
    "",
  );

  return lines.join("\n");
}

export function createRecordExtraDataController(savePath: string): XmlStreamController {
  const data: XmlStreamData = {
    header: XML_FILE_HEADER,
    meta: {
      recordStartTimestamp: Date.now(),
    },
    pendingMessages: [],
  };
  let hasCompleted = false;
  let hasPersistedHeader = false;
  let danmaNum = 0;
  let scNum = 0;
  let guardNum = 0;
  let pkNum = 0;
  /** 单独留存 PK 消息，用于结束时的战报汇总 */
  const pkMessages: DouyinPkMessage[] = [];
  let maxDanmaBucketStart = -1;
  const interactedUsers = new Set<string>();
  const danmaBucketCountMap = new Map<number, number>();

  const getDanmaStats = (): DanmaStatsPayload => {
    if (maxDanmaBucketStart < 0) {
      return {
        danmaTimeline: {
          interval: DANMA_STATS_INTERVAL,
          data: [],
        },
      };
    }

    const stats: number[] = [];
    for (let start = 0; start <= maxDanmaBucketStart; start += DANMA_STATS_INTERVAL) {
      stats.push(danmaBucketCountMap.get(start) ?? 0);
    }

    return {
      danmaTimeline: {
        interval: DANMA_STATS_INTERVAL,
        data: stats,
      },
    };
  };

  const getStats = (): XmlStreamStats => ({
    danmaNum,
    uniqMember: interactedUsers.size,
    scNum,
    guardNum,
    pkNum,
    danmaStats: getDanmaStats(),
  });

  const trackDanmaBucket = (message: Message) => {
    const progressInSeconds = Math.max(
      (message.timestamp - data.meta.recordStartTimestamp) / 1000,
      0,
    );
    const bucketStart = Math.floor(progressInSeconds / DANMA_STATS_INTERVAL) * DANMA_STATS_INTERVAL;
    danmaBucketCountMap.set(bucketStart, (danmaBucketCountMap.get(bucketStart) ?? 0) + 1);
    maxDanmaBucketStart = Math.max(maxDanmaBucketStart, bucketStart);
  };

  const trackInteractedUser = (message: Message) => {
    const userName = "sender" in message ? message.sender?.name?.trim() : undefined;
    if (!userName) return;
    interactedUsers.add(userName);
  };

  const initializeFile = async (content: string) => {
    // 这里有个假设，那就是第一次保存必然存在metatdata信息
    const initialContent = data.header.replace(
      METADATA_PLACEHOLDER,
      generateMetadataXml(data.meta),
    );
    await fs.promises.writeFile(savePath, initialContent + content);
    hasPersistedHeader = true;
  };

  const writeToFile = async (force = false): Promise<void> => {
    if (!force && data.pendingMessages.length === 0) {
      return Promise.resolve();
    }

    const messagesToWrite = [...data.pendingMessages];
    data.pendingMessages = [];

    try {
      const xmlContent = generateXmlContent(data.meta, messagesToWrite);
      if (!hasPersistedHeader) {
        await initializeFile(xmlContent);
      } else if (xmlContent) {
        await appendToXmlFile(savePath, xmlContent);
      }
    } catch (error) {
      console.error("写入XML文件失败:", error);
      data.pendingMessages = [...messagesToWrite, ...data.pendingMessages];
    }
  };

  // 每10秒写入一次数据
  const writeTimer = setInterval(() => {
    writeToFile();
  }, 10e3);

  const addMessage: XmlStreamController["addMessage"] = (message) => {
    if (hasCompleted) return;
    if (message.type === "comment") {
      danmaNum += 1;
      trackDanmaBucket(message);
    } else if (message.type === "super_chat") {
      scNum += 1;
    } else if (message.type === "guard") {
      guardNum += 1;
    } else if (message.type === "pk_status" || message.type === "douyin_pk") {
      pkNum += 1;
      if (message.type === "douyin_pk") pkMessages.push(message);
    }
    trackInteractedUser(message);
    data.pendingMessages.push(message);
  };

  const setMeta: XmlStreamController["setMeta"] = async (meta) => {
    if (hasCompleted) return;
    data.meta = {
      ...data.meta,
      ...meta,
    };
  };

  /** 与 XML 同名的 .pk.md 战报，仅在收到 PK 消息时生成 */
  const writePkReport = async () => {
    if (pkMessages.length === 0) return;
    const mdPath = `${savePath.replace(/\.xml$/i, "")}.pk.md`;
    try {
      await fs.promises.writeFile(mdPath, buildPkMarkdown(data.meta, pkMessages), "utf8");
    } catch (error) {
      console.error("写入 PK 战报失败:", error);
    }
  };

  const flush: XmlStreamController["flush"] = async () => {
    if (hasCompleted) return;
    hasCompleted = true;
    writeTimer && clearInterval(writeTimer);
    if (data.meta.recordStopTimestamp === undefined) {
      data.meta.recordStopTimestamp = Date.now();
    }

    try {
      await writeToFile(true);
      await appendToXmlFile(savePath, "</i>");
    } catch (error) {
      console.error("完成XML文件写入失败:", error);
    }

    await writePkReport();

    // 清理内存
    data.pendingMessages = [];
    pkMessages.length = 0;
    interactedUsers.clear();
    danmaNum = 0;
    scNum = 0;
    guardNum = 0;
    pkNum = 0;
  };

  return {
    data,
    addMessage,
    setMeta,
    flush,
    getStats,
  };
}

/**
 * 生成XML内容片段
 */
function generateXmlContent(metadata: XmlStreamData["meta"], messages: Message[]): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@@",
    format: true,
  });

  const comments = messages
    .filter((item) => item.type === "comment")
    .map((ele) => {
      const progress = Math.max((ele.timestamp - metadata.recordStartTimestamp) / 1000, 0);
      const attrs = {
        "@@p": "",
        "@@progress": progress,
        "@@mode": String(ele.mode ?? 1),
        "@@fontsize": String(25),
        "@@color": String(parseInt((ele.color || "#ffffff").replace("#", ""), 16)),
        "@@midHash": String(ele?.sender?.uid),
        "#text": String(ele?.text || ""),
        "@@ctime": String(ele.timestamp),
        "@@pool": String(0),
        "@@weight": String(0),
        "@@user": String(ele.sender?.name),
        "@@uid": String(ele?.sender?.uid),
        "@@timestamp": String(ele.timestamp),
      };
      attrs["@@p"] = [
        attrs["@@progress"],
        attrs["@@mode"],
        attrs["@@fontsize"],
        attrs["@@color"],
        attrs["@@ctime"],
        attrs["@@pool"],
        attrs["@@midHash"],
        attrs["@@uid"],
        attrs["@@weight"],
      ].join(",");
      return pick(attrs, ["@@p", "#text", "@@user", "@@uid", "@@timestamp"]);
    });

  const gifts = messages
    .filter((item) => item.type === "give_gift")
    .map((ele) => {
      const progress = Math.max((ele.timestamp - metadata.recordStartTimestamp) / 1000, 0);
      return {
        "@@ts": progress,
        "@@giftname": String(ele.name),
        "@@giftcount": String(ele.count),
        "@@price": String(ele.price * 1000),
        "@@user": String(ele.sender?.name),
        "@@uid": String(ele?.sender?.uid),
        "@@timestamp": String(ele.timestamp),
      };
    });

  const superChats = messages
    .filter((item) => item.type === "super_chat")
    .map((ele) => {
      const progress = Math.max((ele.timestamp - metadata.recordStartTimestamp) / 1000, 0);
      return {
        "@@ts": progress,
        "@@price": String(ele.price * 1000),
        "#text": String(ele.text),
        "@@user": String(ele.sender?.name),
        "@@uid": String(ele?.sender?.uid),
        "@@timestamp": String(ele.timestamp),
      };
    });

  const guardGift = messages
    .filter((item) => item.type === "guard")
    .map((ele) => {
      const progress = Math.max((ele.timestamp - metadata.recordStartTimestamp) / 1000, 0);
      return {
        "@@ts": progress,
        "@@price": String(ele.price * 1000),
        "@@giftname": String(ele.name),
        "@@giftcount": String(ele.count),
        "@@level": String(ele.level),
        "@@user": String(ele.sender?.name),
        "@@uid": String(ele?.sender?.uid),
        "@@timestamp": String(ele.timestamp),
      };
    });

  const pkRecords = messages
    .filter((item) => item.type === "pk_status")
    .map((ele) => {
      const progress = Math.max((ele.timestamp - metadata.recordStartTimestamp) / 1000, 0);
      return {
        "@@ts": progress,
        "@@status": String(ele.status),
        "@@opponent": String(ele.opponent?.name ?? ""),
        "@@timestamp": String(ele.timestamp),
      };
    });

  const formatArmies = (
    users?: { uid?: string | null; nickname: string; score: string }[],
  ): string => (users ?? []).map((u) => `${u.nickname || u.uid || "匿名"} ${u.score}`).join(" / ");

  const douyinPkRecords = messages
    .filter((item) => item.type === "douyin_pk")
    .map((ele) => {
      const progress = Math.max((ele.timestamp - metadata.recordStartTimestamp) / 1000, 0);
      const record: Record<string, unknown> = {
        "@@ts": Math.round(progress * 1000) / 1000,
        "@@event": ele.event,
        "@@battle_id": String(ele.battleId ?? ele.contextBattleId ?? ""),
        "@@timestamp": String(ele.timestamp),
      };
      if (ele.duration !== undefined) record["@@duration"] = String(ele.duration);
      if (ele.elapsed !== undefined) record["@@pkt"] = String(ele.elapsed);
      if (ele.myScore !== undefined) record["@@my_score"] = String(ele.myScore);
      if (ele.myScoreText) record["@@my_score_text"] = ele.myScoreText;
      if (ele.myRank !== undefined) record["@@my_rank"] = String(ele.myRank);
      if (ele.myName) record["@@my_name"] = ele.myName;
      if (ele.myHomepage) record["@@my_homepage"] = ele.myHomepage;
      if (ele.opponentScore !== undefined) record["@@opponent_score"] = String(ele.opponentScore);
      if (ele.opponentScoreText) record["@@opponent_score_text"] = ele.opponentScoreText;
      if (ele.opponentId) record["@@opponent_id"] = String(ele.opponentId);
      if (ele.opponentName) record["@@opponent_name"] = ele.opponentName;
      const firstOpponent =
        (ele.opponents ?? []).find((o) => o.anchorId && o.anchorId === ele.opponentId) ??
        (ele.opponents ?? [])[0];
      if (firstOpponent?.homepage) record["@@opponent_homepage"] = firstOpponent.homepage;
      if (ele.myScore !== undefined && ele.opponentScore !== undefined) {
        const diff = Number(ele.myScore) - Number(ele.opponentScore);
        if (!Number.isNaN(diff)) record["@@diff"] = String(diff);
      }
      if (ele.myArmies?.length) record["@@my_armies"] = formatArmies(ele.myArmies);
      if (ele.opponentArmies?.length)
        record["@@opponent_armies"] = formatArmies(ele.opponentArmies);

      // 只保留有比分或贡献榜的对手，避免贡献榜快照写出 "id::" 这类空值
      const visible = (ele.opponents ?? []).filter(
        (o) => o.score !== undefined || (o.armies?.length ?? 0) > 0,
      );
      if (visible.length > 0) {
        // 机器可读：id:score:rank，只保留有比分的对手
        const scored = visible.filter((o) => o.score !== undefined);
        if (scored.length > 0) {
          record["@@opponents"] = scored
            .map((o) => `${o.anchorId ?? ""}:${o.score ?? ""}:${o.rank ?? ""}`)
            .join(",");
        }
        // 人类可读：对手1 13.1万 第1（有名称时优先用名称）
        record["@@opponents_readable"] = visible
          .map((o) => {
            const label = o.anchorName || o.label || (o.anchorId ? `ID ${o.anchorId}` : "对手");
            const parts = [label];
            if (o.score !== undefined) parts.push(o.scoreText || o.score);
            if (o.rank) parts.push(`第${o.rank}`);
            if (o.armies?.length) parts.push(`榜 ${formatArmies(o.armies)}`);
            return parts.join(" ");
          })
          .join("，");
      }
      // 结构化子节点：每个助力用户一条，便于机器解析（不再只靠字符串）
      const armies: Record<string, unknown>[] = [];
      const pushArmies = (
        side: string,
        anchorId: string | null | undefined,
        users?: { uid?: string | null; nickname: string; score: string; rank?: number }[],
      ) => {
        (users ?? []).forEach((u, index) => {
          armies.push({
            "@@side": side,
            "@@anchor_id": String(anchorId ?? ""),
            "@@rank": String(u.rank ?? index + 1),
            "@@uid": String(u.uid ?? ""),
            "@@nickname": u.nickname || "",
            "@@score": String(u.score),
          });
        });
      };
      if (ele.myArmies?.length) pushArmies("mine", null, ele.myArmies);
      let hasOpponentArmies = false;
      for (const o of ele.opponents ?? []) {
        if (o.armies?.length) {
          hasOpponentArmies = true;
          pushArmies("opponent", o.anchorId, o.armies);
        }
      }
      // 兼容只写了 opponentArmies（单对手）的消息
      if (!hasOpponentArmies && ele.opponentArmies?.length) {
        pushArmies("opponent", ele.opponentId, ele.opponentArmies);
      }
      if (ele.unassignedArmies?.length) pushArmies("unassigned", null, ele.unassignedArmies);
      if (armies.length > 0) record.army = armies;

      return record;
    });

  // 构建这一批消息的XML片段
  const fragment: Record<string, unknown> = {
    d: comments,
    gift: gifts,
    sc: superChats,
    guard: guardGift,
  };
  // 仅在存在 PK 记录时写入，避免旧行为产生空的 <pk/> 节点
  if (pkRecords.length > 0) {
    fragment.pk = pkRecords;
  }
  if (douyinPkRecords.length > 0) {
    fragment.douyin_pk = douyinPkRecords;
  }

  return builder.build(fragment);
}

/**
 * 追加内容到XML文件
 */
async function appendToXmlFile(filePath: string, content: string): Promise<void> {
  try {
    // 直接追加内容
    await fs.promises.appendFile(filePath, content);
  } catch (error) {
    console.error(`写入XML文件失败: ${filePath}`, error);
    throw error;
  }
}

function generateMetadataXml(metadata: XmlStreamData["meta"]): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@@",
    format: true,
  });

  return builder.build({
    metadata: {
      platform: metadata.platform,
      video_start_time: metadata.recordStartTimestamp,
      live_start_time: metadata.liveStartTimestamp,
      room_title: metadata.title,
      user_name: metadata.user_name,
      room_id: metadata.room_id,
    },
  });
}
