# 抖音 PK 主播在线补全：接口失效警示

> 最近验证：2026-11-12（用真实直播间 uid 验证通过）

## 这条警告为什么存在

抖音的 PK 报文（`LinkMicMethod` / `LinkMicBattle` / `LinkMicBattleFinish` / `LinkMicArmies`）
只下发主播的数字 uid，**不含昵称，也不含 sec_uid**。为了在战报里显示对手名字和可点击主页，
本包会按 uid 再查一次抖音的直播端用户接口。

**这个接口是未公开的内部接口，没有版本号、没有 SLA、没有兼容性承诺。**
抖音随时可能改参数、加签名、限流或直接下线，且不会有任何通知。
因此本功能是「锦上添花」，不是数据来源；任何情况下都必须能安静地退回纯 uid。

## 接口与参数

```
GET https://live.douyin.com/webcast/user/
    ?aid=6383
    &app_name=douyin_web
    &device_platform=web
    &uid=<数字 uid>
    &target_uid=<同一个数字 uid>
```

成功时 `status_code: 0`，`data.nickname` 是昵称，`data.sec_uid` 可直接拼
`https://www.douyin.com/user/<sec_uid>`。

已实测的两个坑（踩过一个就足以误判「接口被封了」）：

| 情况 | 结果 |
| --- | --- |
| 缺 `target_uid` | `10033 forbidden / 暂不支持查看个人信息` |
| 带 `Referer: https://live.douyin.com/` | 同样 `10033` |
| `uid` 是精度丢失后的假 uid | `20001`，无数据 |

请求不带 cookie、不带账号态，只需要一个浏览器 UA；不要给它加签名参数或登录态。

## 失效时会怎样

**不会报错，这是设计好的，但也意味着容易漏发现。**

- `fetchAnchorProfile` 超时 4 秒、非 0 状态码、字段缺失，都返回 `undefined`；
- 失败后该 uid 冷却 10 分钟，不会反复打接口；
- PK 事件继续正常写入，战报退回 `对手1 · uid` 或手动档案里的名字；
- 录制、弹幕、礼物、PK 分值采集完全不受影响。

典型信号：某天起所有新战报里的对手都变回纯数字 ID，而日志里没有任何异常。

## 怎么确认是否失效

用已知昵称的 uid 做对照（下面这个 uid 对应「天绮一也」，仅用于连通性验证）：

```bash
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36" \
  "https://live.douyin.com/webcast/user/?aid=6383&app_name=douyin_web&device_platform=web&uid=2905370608805496&target_uid=2905370608805496" \
  | head -c 300
```

- 返回 `"nickname":"天绮一也"` → 接口正常，问题在别处（uid 无效、网络、开关被关）；
- 返回 `10033` → 参数形态变了，先试去掉/替换 `target_uid`、调整 `aid`；
- 返回空、验证码、要求 `a_bogus` → 接口已加签名或下线，**不要试图逆向签名**，走应急方案。

排查顺序：设置里的「在线补全昵称」是否被关 → 上面这条 curl → 该 uid 是否本身无效（把战报里的 uid 逐个试）。

## 应急处理（按成本从低到高）

1. **关掉开关**：设置 → 直播录制 → 抖音 → 「在线补全昵称」。程序立刻停止发起查询，
   仍然使用本机解析过的直播间信息和手动档案。
2. **手动补录**：在「PK 主播档案」里按 uid 填昵称，或用「扫描战报 / 导入单场战报」
   批量生成待填行。手动档案优先级高于网络结果，不会被覆盖。
3. **换数据源**：如果找到新的、更稳定的直播间接口，只需替换
   `src/anchor.ts` 里的 `requestAnchorProfile()`，其他链路（缓存、优先级、持久化、
   战报渲染）不用动。
4. **不要做的事**：不要为了补一个名字引入 `webmssdk` 签名环境、jsdom 或无头浏览器；
   不要拿数字 uid 拼 `douyin.com/user/<uid>`（会 404）；不要接第三方付费查号服务。

## 相关代码

| 文件 | 职责 |
| --- | --- |
| `packages/DouYinRecorder/src/anchor.ts` | 接口请求、三级档案优先级、缓存与开关 |
| `packages/DouYinRecorder/src/index.ts` | PK 事件里 fire-and-forget 触发补全 |
| `packages/shared/src/recorder/index.ts` | 注入配置、把查询结果防抖写回 `appConfig` |
| `packages/liveManager/src/xml_stream_controller.ts` | 战报渲染，昵称优先于「对手N」 |
| `packages/types/src/index.ts` | `DouyinAnchorLookup` 配置结构 |

## 开关与缓存

- 配置 `douyinAnchorLookup.enabled` 默认 `true`；关闭后不发任何在线请求。
- 成功结果写入 `douyinAnchorLookup.cache`（防抖 3 秒落盘），启动时灌回内存，
  重启不会重复查询同一 uid。缓存只保存昵称/sec_uid/主页，不含任何登录态。
- 优先级：**本机解析 > 手动登记 > 网络补全**，网络结果只补空缺字段，不会覆盖用户填的名字。
- 清缓存：删除 `appConfig.json` 里 `douyinAnchorLookup.cache` 的内容即可；
  删除后下次录制会重新查询。
