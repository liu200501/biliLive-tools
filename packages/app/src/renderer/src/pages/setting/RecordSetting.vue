<template>
  <div class="">
    <div style="display: flex; gap: 10px; align-items: center">
      <h2>录制配置</h2>
      <p>此项大部分配置不即时生效，需重新开始一个录制方可生效</p>
    </div>

    <n-form label-placement="left" :label-width="labelWidth">
      <n-tabs type="segment" style="margin-top: 10px" class="tabs">
        <n-tab-pane
          class="tab-pane"
          name="common-setting"
          tab="基础设置"
          display-directive="show:lazy"
        >
          <n-form-item>
            <template #label>
              <span class="inline-flex"> 保存文件夹 </span>
            </template>
            <n-input v-model:value="config.recorder.savePath" placeholder="请选择要保存的文件夹" />
            <n-icon style="margin-left: 10px" size="26" class="pointer" @click="selectFolder">
              <FolderOpenOutline />
            </n-icon>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :tip="titleTip" text="文件命名规则"></Tip>
            </template>
            <n-input
              ref="titleInput"
              :disabled="!allowEdit"
              v-model:value="config.recorder.nameRule"
              placeholder="请输入文件命名规则"
              clearable
              spellcheck="false"
              @blur="handleNameRuleBlur"
            />
            <n-checkbox v-model:checked="allowEdit" style="margin: 0 10px"></n-checkbox>
            <template #feedback>
              <span
                v-for="item in titleList"
                :key="item.value"
                :title="item.label"
                class="title-var"
                @click="setTitleVar(item.value)"
                >{{ item.value }}</span
              >
            </template>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
            >
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :tip="textInfo.common.waitTime.tip" :text="textInfo.common.waitTime.text"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.waitTime"
              min="0"
              step="1"
              style="width: 220px"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                tip="0为不分段，默认为时间分段，单位分钟。<br/>如果以B,KB,MB,GB结尾，会尝试使用文件大小分段，<b>不推荐在ffmpeg引擎时使用</b>"
                text="分段"
              ></Tip>
            </template>
            <n-input v-model:value="config.recorder.segment" placeholder="请输入分段参数" />
          </n-form-item>

          <n-form-item>
            <template #label>
              <span> 保存封面 </span>
            </template>
            <n-switch v-model:value="config.recorder.saveCover" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :text="textInfo.common.convert2Mp4.text"
                :tip="textInfo.common.convert2Mp4.tip"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.convert2Mp4" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.format.text" :tip="textInfo.common.format.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.videoFormat"
              :options="videoFormatOptions"
              style="width: 220px"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :text="textInfo.common.recorderType.text"
                :tip="textInfo.common.recorderType.tip"
              ></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.recorderType"
              :options="recorderTypeOptions"
              style="width: 220px"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.douyu.qualityRetry.tip"
                :text="textInfo.douyu.qualityRetry.text"
              ></Tip>
            </template>
            <n-input-number v-model:value="config.recorder.qualityRetry" min="-1" step="1">
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                tip="录制结束后，立即尝试重新检查，避免下一个检查周期到来时才进行检查，导致缺少部分时间。<br/>
                每场直播最多进行五十次重试。"
                text="录制结束立即重试"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.recordRetryImmediately" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip tip="如果你遇到特定直播间的录制问题，请打开此开关" text="调试模式"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.debugLevel"
              :options="recorderDebugLevelOptions"
              style="width: 220px"
            />
          </n-form-item>

          <h3>弹幕</h3>
          <n-form-item>
            <template #label>
              <span class="inline-flex"> 弹幕录制 </span>
            </template>
            <n-switch
              v-model:value="config.recorder.disableProvideCommentsWhenRecording"
              :checked-value="false"
              :unchecked-value="true"
            />
          </n-form-item>
          <n-form-item v-if="!config.recorder.disableProvideCommentsWhenRecording">
            <template #label>
              <span class="inline-flex"> 保存礼物 </span>
            </template>
            <n-switch v-model:value="config.recorder.saveGiftDanma" />
          </n-form-item>
          <n-form-item v-if="!config.recorder.disableProvideCommentsWhenRecording">
            <template #label>
              <Tip
                text="保存 PK 数据"
                tip="录制 PK 开始/结束状态与比分数据（B站为 PK 状态，抖音为 PK 事件与比分），关闭后不再记录 PK 数据"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.savePkDanma" />
          </n-form-item>
          <n-form-item v-if="!config.recorder.disableProvideCommentsWhenRecording">
            <template #label>
              <span class="inline-flex"> 高能弹幕(SC) </span>
            </template>
            <n-switch v-model:value="config.recorder.saveSCDanma" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                text="服务端时间戳"
                tip="使用服务端返回的弹幕时间戳而非本地收到的时间戳，用于处理某些主播的弹幕时间戳不准确的问题"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.useServerTimestamp" />
          </n-form-item>
          <n-form-item v-if="!config.recorder.disableProvideCommentsWhenRecording">
            <template #label>
              <Tip
                text="弹幕统计入库"
                tip="录制结束后，将弹幕时间分布保存到数据库，供录制历史和主播详情展示"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.saveDanmaStats2DB" />
          </n-form-item>
        </n-tab-pane>
        <n-tab-pane class="tab-pane" name="bilibili" tab="B站" display-directive="show:lazy">
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.bili.uid.text">{{ textInfo.bili.uid.tip }}</Tip>
            </template>
            <n-select
              v-model:value="config.recorder.bilibili.uid"
              :options="userList"
              label-field="name"
              value-field="uid"
              clearable
            />
            <n-button style="margin-left: 10px" @click="emit('login', 'bilibili')" type="primary"
              >登录</n-button
            >
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.bili.quality.text" :tip="textInfo.bili.quality.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.bilibili.quality"
              :options="biliQualityOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.bili.formatName.text" :tip="textInfo.bili.formatName.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.bilibili.formatName"
              :options="biliStreamFormatOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.bili.codecName.text" :tip="textInfo.bili.codecName.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.bilibili.codecName"
              :options="biliStreamCodecOptions"
            />
          </n-form-item>
          <n-form-item v-if="config.recorder.bilibili.formatName !== 'flv_only'">
            <template #label>
              <Tip
                :tip="textInfo.bili.useM3U8Proxy.tip"
                :text="textInfo.bili.useM3U8Proxy.text"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.bilibili.useM3U8Proxy" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :tip="textInfo.bili.customHost.tip" :text="textInfo.bili.customHost.text"></Tip>
            </template>
            <n-input
              v-model:value="config.recorder.bilibili.customHost"
              placeholder="例如：cn-jsyz-ct-03-32.bilivideo.com"
              clearable
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :text="textInfo.bili.segmentOnTitleChange.text"
                :tip="textInfo.bili.segmentOnTitleChange.tip"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.bilibili.segmentOnTitleChange" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                tip="使用批量检查直播状态接口，如果你录制了大量的直播间，可以尝试开启此选项，减少被风控的可能性"
                text="批量查询接口"
              ></Tip>
            </template>
            <n-switch v-model:value="config.recorder.bilibili.useBatchQuery" />
          </n-form-item>
          <div class="divider"></div>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.bilibili.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
              :placeholder="textInfo.common.checkInterval.placeholder"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.bilibili.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.maxThreadCount.placeholder"
            >
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.waitTime.text" :tip="textInfo.common.waitTime.tip"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.bilibili.waitTime"
              min="0"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.waitTime.placeholder"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
        </n-tab-pane>
        <n-tab-pane class="tab-pane" name="douyu" tab="斗鱼" display-directive="show:lazy">
          <n-form-item>
            <template #label>
              <Tip
                text="账号"
                tip="未选择账号时将以未登录状态请求斗鱼接口，请先在用户页登录斗鱼账号"
              ></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.douyu.uid"
              :options="douyuUserList"
              label-field="name"
              value-field="uid"
              clearable
              placeholder="请先在用户页登录斗鱼账号"
            />
            <n-button style="margin-left: 10px" @click="emit('login', 'douyu')" type="primary"
              >登录</n-button
            >
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.douyu.quality.text" :tip="textInfo.douyu.quality.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.douyu.quality"
              :options="douyuQualityOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="线路" tip="如果设置的不存在，会采用默认"></Tip>
            </template>
            <n-select v-model:value="config.recorder.douyu.source" :options="douyuSourceOptions" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.douyu.api.text" :tip="textInfo.douyu.api.tip"></Tip>
            </template>
            <n-select v-model:value="config.recorder.douyu.api" :options="douyuApiTypeOptions" />
          </n-form-item>
          <n-form-item v-if="config.recorder.douyu.api !== 'oldAPI'">
            <template #label>
              <Tip :text="textInfo.douyu.codecName.text" :tip="textInfo.douyu.codecName.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.douyu.codecName"
              :options="douyuStreamCodecOptions"
            />
          </n-form-item>

          <div class="divider"></div>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.douyu.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
              :placeholder="textInfo.common.checkInterval.placeholder"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.douyu.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.maxThreadCount.placeholder"
            >
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.waitTime.text" :tip="textInfo.common.waitTime.tip"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.douyu.waitTime"
              min="0"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.waitTime.placeholder"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
        </n-tab-pane>
        <n-tab-pane class="tab-pane" name="huya" tab="虎牙" display-directive="show:lazy">
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.huya.quality.text" :tip="textInfo.huya.quality.tip"></Tip>
            </template>
            <n-select v-model:value="config.recorder.huya.quality" :options="huyaQualityOptions" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.huya.formatName.text" :tip="textInfo.huya.formatName.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.huya.formatName"
              :options="douyinStreamFormatOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="线路"></Tip>
            </template>
            <n-select v-model:value="config.recorder.huya.source" :options="huyaSourceOptions" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.huya.api.text" :tip="textInfo.huya.api.tip"></Tip>
            </template>
            <n-select v-model:value="config.recorder.huya.api" :options="huyaApiTypeOptions" />
          </n-form-item>

          <div class="divider"></div>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.huya.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
              :placeholder="textInfo.common.checkInterval.placeholder"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.huya.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.maxThreadCount.placeholder"
            >
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.waitTime.text" :tip="textInfo.common.waitTime.tip"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.huya.waitTime"
              min="0"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.waitTime.placeholder"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
        </n-tab-pane>
        <n-tab-pane class="tab-pane" name="douyin" tab="抖音" display-directive="show:lazy">
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.douyin.quality.text" :tip="textInfo.douyin.quality.tip"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.douyin.quality"
              :options="douyinQualityOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :text="textInfo.douyin.formatName.text"
                :tip="textInfo.douyin.formatName.tip"
              ></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.douyin.formatName"
              :options="douyinStreamFormatOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.douyin.api.text" :tip="textInfo.douyin.api.tip"></Tip>
            </template>
            <n-select v-model:value="config.recorder.douyin.api" :options="douyinApiTypeOptions" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="Cookie" tip="使用mobile接口时Cookie不会被应用"></Tip>
            </template>
            <n-input
              v-model:value="config.recorder.douyin.cookie"
              type="password"
              show-password-on="click"
            />
            <n-button
              v-if="!isWeb"
              type="primary"
              style="margin-left: 10px"
              @click="douyinLogin"
              title="登录后退出即可获取cookie"
              >登录</n-button
            >
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :text="textInfo.douyin.cookieMode.text"
                :tip="textInfo.douyin.cookieMode.tip"
              ></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.douyin.cookieMode"
              :options="douyinCookieModeOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="双屏直播流" tip="开启后如果是双屏直播，那么就使用拼接的流"></Tip>
            </template>
            <n-switch v-model:value="config.recorder.douyin.doubleScreen" />
          </n-form-item>

          <div class="divider"></div>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.douyin.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
              :placeholder="textInfo.common.checkInterval.placeholder"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.douyin.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.maxThreadCount.placeholder"
            >
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.waitTime.text" :tip="textInfo.common.waitTime.tip"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.douyin.waitTime"
              min="0"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.waitTime.placeholder"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>

          <div class="divider"></div>
          <div class="anchor-editor">
            <div class="anchor-header">
              <h3>PK 主播档案</h3>
              <span class="anchor-tip"
                >抖音 PK 报文只下发主播数字 ID，不含昵称和主页；本机录制过的主播会自动记住。
                这里可以手动补充从未录制过的对手，保存后立即生效（无需重启）。<br />
                懒得一个个找 uid 时，可以从战报里批量导入：扫描只读取录制目录下最近 N 天的
                <code>.pk.md</code> 并提取其中的主播 uid，不会上传任何内容；导入后只需补昵称。 只有
                uid、没有昵称和主页的行不会生效。</span
              >
            </div>
            <div class="anchor-toolbar">
              <div class="anchor-toolbar-group">
                <n-switch v-model:value="anchorImportEnabled" size="small" />
                <span class="anchor-toolbar-label">战报扫描</span>
                <n-input-number
                  v-model:value="anchorImportDays"
                  size="small"
                  :min="1"
                  :max="365"
                  :disabled="!anchorImportEnabled"
                  style="width: 120px"
                >
                  <template #suffix>天</template>
                </n-input-number>
                <span class="anchor-toolbar-label">内</span>
              </div>
              <div class="anchor-toolbar-group">
                <n-button
                  size="small"
                  :disabled="!anchorImportEnabled"
                  :loading="scanning"
                  @click="scanRecentReports"
                >
                  扫描战报
                </n-button>
                <n-button size="small" :loading="parsing" @click="importSingleReport"
                  >导入单场战报</n-button
                >
              </div>
            </div>
            <div v-if="importHint" class="anchor-hint">{{ importHint }}</div>
            <div v-if="anchorProfiles.length === 0" class="anchor-empty">
              暂无手动档案，PK 战报里未识别的对手会显示为「对手1 · 数字ID」。
            </div>
            <div v-for="(item, index) in anchorProfiles" :key="index" class="anchor-row">
              <n-input
                v-model:value="item.uid"
                class="anchor-uid"
                placeholder="主播 uid（战报里的数字 ID）"
                spellcheck="false"
              />
              <n-input
                v-model:value="item.name"
                class="anchor-name"
                placeholder="昵称（可选）"
                spellcheck="false"
              />
              <n-input
                v-model:value="item.homepage"
                class="anchor-home"
                placeholder="主页链接或 sec_uid（可选）"
                spellcheck="false"
                @blur="normalizeAnchorHomepage(item)"
              />
              <n-button
                v-if="isValidHomepage(item)"
                text
                size="tiny"
                type="primary"
                @click="openAnchorHomepage(item)"
                >打开</n-button
              >
              <n-button
                quaternary
                circle
                type="error"
                title="删除"
                @click="removeAnchorProfile(index)"
              >
                <n-icon><TrashOutline /></n-icon>
              </n-button>
            </div>
            <n-button dashed size="small" @click="addAnchorProfile">
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
              添加主播
            </n-button>
            <div v-if="invalidAnchorCount > 0" class="anchor-error">
              有 {{ invalidAnchorCount }} 行缺少 uid，保存后会被忽略。
            </div>
          </div>
        </n-tab-pane>
        <n-tab-pane class="tab-pane" name="xhs" tab="小红书" display-directive="show:lazy">
          <h3 style="margin-bottom: 10px">设置Cookie可自动监听，建议使用小号</h3>
          <n-form-item>
            <template #label>
              <Tip text="Cookie" tip="用于自动监听"></Tip>
            </template>
            <n-input
              v-model:value="config.recorder.xhs.cookie"
              type="password"
              show-password-on="click"
            />
            <n-button
              v-if="!isWeb"
              type="primary"
              style="margin-left: 10px"
              @click="xhsLogin"
              title="登录后退出即可获取cookie，小红书一个帐号只能登录一端"
              >登录</n-button
            >
          </n-form-item>

          <div class="divider"></div>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.xhs.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
              :placeholder="textInfo.common.checkInterval.placeholder"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.xhs.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.maxThreadCount.placeholder"
            >
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.waitTime.text" :tip="textInfo.common.waitTime.tip"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.xhs.waitTime"
              min="0"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.waitTime.placeholder"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
        </n-tab-pane>
        <n-tab-pane class="tab-pane" name="tiktok" tab="TikTok" display-directive="show:lazy">
          <n-form-item>
            <template #label>
              <Tip text="画质" tip="使用 TikTok 原生画质标识选择直播流"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.tiktok.quality"
              :options="tiktokQualityOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="流格式" tip="默认优先 FLV，其次 HLS"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.tiktok.formatName"
              :options="douyinStreamFormatOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="流编码" tip="自动模式默认使用 AVC，也可优先或强制使用 HEVC"></Tip>
            </template>
            <n-select
              v-model:value="config.recorder.tiktok.codecName"
              :options="biliStreamCodecOptions"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="请求接口" tip="随机模式会在 web 接口和直播 html 解析之间随机选择"></Tip>
            </template>
            <n-select v-model:value="config.recorder.tiktok.api" :options="tiktokApiTypeOptions" />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="Cookie" tip="遇到年龄限制或风控时可填写 TikTok Cookie"></Tip>
            </template>
            <n-input
              v-model:value="config.recorder.tiktok.cookie"
              type="password"
              show-password-on="click"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip text="代理" tip="用于请求和直播流录制，支持http代理"></Tip>
            </template>
            <n-input
              v-model:value="config.recorder.tiktok.proxy"
              placeholder="例如：http://127.0.0.1:7890"
              clearable
            />
          </n-form-item>

          <div class="divider"></div>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.checkInterval.tip"
                :text="textInfo.common.checkInterval.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.tiktok.checkInterval"
              min="10"
              step="10"
              style="width: 220px"
              :placeholder="textInfo.common.checkInterval.placeholder"
            >
              <template #suffix>秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip
                :tip="textInfo.common.maxThreadCount.tip"
                :text="textInfo.common.maxThreadCount.text"
              ></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.tiktok.maxThreadCount"
              min="1"
              max="10"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.maxThreadCount.placeholder"
            />
          </n-form-item>
          <n-form-item>
            <template #label>
              <Tip :text="textInfo.common.waitTime.text" :tip="textInfo.common.waitTime.tip"></Tip>
            </template>
            <n-input-number
              v-model:value="config.recorder.tiktok.waitTime"
              min="0"
              step="1"
              style="width: 220px"
              :placeholder="textInfo.common.waitTime.placeholder"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
        </n-tab-pane>
      </n-tabs>
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { FolderOpenOutline, AddOutline, TrashOutline } from "@vicons/ionicons5";
import { useFileDialog, templateRef } from "@vueuse/core";
import { useBreakpoints } from "@renderer/hooks";
import { recoderApi } from "@renderer/apis";
import { showDirectoryDialog } from "@renderer/utils/fileSystem";
import { useUserInfoStore, useDouyuUserStore } from "@renderer/stores";
import { useConfirm } from "@renderer/hooks";
import {
  biliQualityOptions,
  douyuQualityOptions,
  huyaQualityOptions,
  textInfo,
  biliStreamFormatOptions,
  biliStreamCodecOptions,
  douyinQualityOptions,
  douyuSourceOptions,
  videoFormatOptions,
  douyinStreamFormatOptions,
  huyaSourceOptions,
  recorderTypeOptions,
  recorderDebugLevelOptions,
  douyinApiTypeOptions,
  douyinCookieModeOptions,
  huyaApiTypeOptions,
  douyuStreamCodecOptions,
  douyuApiTypeOptions,
  tiktokApiTypeOptions,
  tiktokQualityOptions,
} from "@renderer/enums/recorder";

import type { AppConfig, DouyinAnchorProfile } from "@biliLive-tools/types";

const config = defineModel<AppConfig>("data", {
  default: () => {},
});
const emit = defineEmits<{
  (event: "login", platform: "bilibili" | "douyu"): void;
}>();
const { isMobile } = useBreakpoints();
const labelWidth = computed(() => {
  return isMobile.value ? "90px" : "145px";
});

const { userList } = storeToRefs(useUserInfoStore());
const { userList: douyuUserList } = storeToRefs(useDouyuUserStore());
const isWeb = computed(() => window.isWeb);

const selectFolder = async () => {
  let file: string | undefined = await showDirectoryDialog({
    defaultPath: config.value.recorder.savePath,
  });

  if (!file) return;
  config.value.recorder.savePath = file;
};

// 抖音 PK 主播档案：uid → 昵称/主页，用于补全 PK 报文里缺失的对手信息
const anchorProfiles = computed<DouyinAnchorProfile[]>({
  get: () => config.value.douyinAnchorProfiles ?? [],
  set: (value) => {
    config.value.douyinAnchorProfiles = value;
  },
});

const invalidAnchorCount = computed(
  () => anchorProfiles.value.filter((item) => !item.uid?.trim()).length,
);

const addAnchorProfile = () => {
  anchorProfiles.value = [...anchorProfiles.value, { uid: "", name: "", homepage: "" }];
};

const removeAnchorProfile = (index: number) => {
  const list = [...anchorProfiles.value];
  list.splice(index, 1);
  anchorProfiles.value = list;
};

/** 允许直接粘贴 sec_uid 或省略协议的链接，统一补成完整主页链接 */
const normalizeAnchorHomepage = (item: DouyinAnchorProfile) => {
  const value = item.homepage?.trim();
  if (!value) return;
  if (/^https?:\/\//i.test(value)) return;
  if (value.includes("/user/")) {
    item.homepage = `https://${value.replace(/^\/+/, "")}`;
    return;
  }
  item.homepage = `https://www.douyin.com/user/${value}`;
};

const isValidHomepage = (item: DouyinAnchorProfile) =>
  /^https?:\/\//i.test(item.homepage?.trim() ?? "");

const openAnchorHomepage = (item: DouyinAnchorProfile) => {
  const url = item.homepage?.trim();
  if (!url) return;
  if (isWeb.value) {
    window.open(url, "_blank");
    return;
  }
  window.api.openExternal(url);
};

// 战报导入：开关 + 扫描天数（保存后由后端在扫描时读取）
const DEFAULT_ANCHOR_IMPORT = { enabled: true, days: 7 };
const anchorImportValue = computed(() => config.value.douyinAnchorImport ?? DEFAULT_ANCHOR_IMPORT);

const anchorImportEnabled = computed({
  get: () => anchorImportValue.value.enabled ?? DEFAULT_ANCHOR_IMPORT.enabled,
  set: (value: boolean) => {
    config.value.douyinAnchorImport = { ...anchorImportValue.value, enabled: value };
  },
});

const anchorImportDays = computed({
  get: () => anchorImportValue.value.days ?? DEFAULT_ANCHOR_IMPORT.days,
  set: (value: number | null) => {
    config.value.douyinAnchorImport = {
      ...anchorImportValue.value,
      days: value ?? DEFAULT_ANCHOR_IMPORT.days,
    };
  },
});

const scanning = ref(false);
const parsing = ref(false);
const importHint = ref("");

/** 把导入结果合并进编辑区，已有 uid 不重复添加 */
const mergeImportedAnchors = (hits: { uid: string }[], source: string) => {
  const existing = new Set(
    anchorProfiles.value.map((item) => item.uid?.trim() ?? "").filter(Boolean),
  );
  const added: DouyinAnchorProfile[] = [];
  for (const hit of hits) {
    const uid = hit.uid?.trim();
    if (!uid || existing.has(uid)) continue;
    existing.add(uid);
    added.push({ uid, name: "", homepage: "" });
  }

  if (added.length > 0) {
    anchorProfiles.value = [...anchorProfiles.value, ...added];
    importHint.value = `${source}：新增 ${added.length} 位待命名主播，填好昵称后保存即可。`;
  } else {
    importHint.value = `${source}：没有发现新的未识别主播。`;
  }
};

const scanRecentReports = async () => {
  scanning.value = true;
  importHint.value = "";
  try {
    const result = await recoderApi.scanPkReportAnchors({ days: anchorImportDays.value });
    if (result.reason) {
      importHint.value = result.reason;
      return;
    }
    mergeImportedAnchors(result.anchors, `扫描 ${result.scannedFiles} 份战报`);
  } catch (error) {
    importHint.value = `扫描失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    scanning.value = false;
  }
};

const { open: openReportFile, onChange: onReportFileChange } = useFileDialog({
  accept: ".md",
  multiple: false,
});

onReportFileChange(async (files) => {
  const file = files?.[0];
  if (!file) return;

  parsing.value = true;
  importHint.value = "";
  try {
    const content = await file.text();
    const result = await recoderApi.parsePkReportAnchors(content);
    mergeImportedAnchors(result.anchors, file.name);
  } catch (error) {
    importHint.value = `导入失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    parsing.value = false;
  }
});

const importSingleReport = () => openReportFile();
const titleList = ref([
  {
    value: "{platform}",
    label: "平台",
  },
  {
    value: "{channelId}",
    label: "房间号",
  },
  {
    value: "{remarks}",
    label: "备注",
  },
  {
    value: "{owner}",
    label: "主播名",
  },
  {
    value: "{title}",
    label: "标题",
  },
  {
    value: "{year}",
    label: "年",
  },
  {
    value: "{month}",
    label: "月",
  },
  {
    value: "{date}",
    label: "日",
  },
  {
    value: "{hour}",
    label: "时",
  },
  {
    value: "{min}",
    label: "分",
  },
  {
    value: "{sec}",
    label: "秒",
  },
  {
    value: "{ms}",
    label: "毫秒",
  },
]);
const titleTip = computed(() => {
  const base = `<b>谨慎修改，可能会导致无法录制</b><br/>支持ejs引擎，更多参数见文档<br/>`;
  return titleList.value
    .map((item) => {
      return `${item.label}：${item.value}<br/>`;
    })
    .reduce((prev, cur) => prev + cur, base);
});

const titleInput = templateRef("titleInput");
const setTitleVar = async (value: string) => {
  if (!allowEdit.value) return;
  const input = titleInput.value?.inputElRef;
  if (input) {
    // 获取input光标位置
    const start = input.selectionStart ?? config.value.recorder.nameRule.length;
    const end = input.selectionEnd ?? config.value.recorder.nameRule.length;
    const oldValue = config.value.recorder.nameRule;
    config.value.recorder.nameRule = oldValue.slice(0, start) + value + oldValue.slice(end);
    // 设置光标位置
    input.focus();
    await nextTick();
    input.setSelectionRange(start + value.length, start + value.length);
  } else {
    config.value.recorder.nameRule += value;
  }
};

const confirm = useConfirm();
const allowEdit = ref(false);
watch(allowEdit, async (val) => {
  if (val) {
    const [status] = await confirm.warning({
      content: "修改前确保知道此项参数含义，文件名中至少存在时分秒，谨慎修改，可能会导致无法录制",
    });
    if (!status) {
      allowEdit.value = false;
    }
  }
});

const handleNameRuleBlur = async () => {
  if (config.value.recorder.nameRule.includes(":")) {
    const [status] = await confirm.warning({
      content: "你的文件命名规则中可能包含了冒号(:)，该符合无法作为文件名，是否替换为空格？",
    });
    if (!status) {
      return;
    }
    config.value.recorder.nameRule = config.value.recorder.nameRule.replaceAll(":", " ");
  }
};

const confirmCookieLoginRisk = async (platform: string, extraRisk?: string) => {
  const [status] = await confirm.warning({
    title: `${platform} 登录提示`,
    content: [
      "Cookie 会用于相关的 API 请求中。程序请求与浏览器内正常使用所发送的请求不完全一致，能通过分析请求日志识别出来。",
      "软件开发者不对账号发生的任何事情负责，包括并不限于被标记为机器人账号、无法参与各种抽奖和活动等。建议使用小号。",
      "如您知晓您的账号会因以上所列出来的部分原因所导致无法使用或权益受损等情况，并愿意承担由此所会带来的一系列后果，请继续以下的操作，软件开发者不会对您账号所发生的任何后果承担责任。",
      extraRisk,
    ]
      .filter(Boolean)
      .join("\n"),
    positiveText: "继续登录",
    negativeText: "取消",
  });
  return status;
};

const xhsLogin = async () => {
  const status = await confirmCookieLoginRisk(
    "小红书",
    "小红书一个帐号通常只能保持一端登录，继续后可能会影响你当前设备上的登录状态",
  );
  if (!status) return;

  const cookie = await window.api.cookie.xhsLogin();
  config.value.recorder.xhs.cookie = cookie;
};

const douyinLogin = async () => {
  const status = await confirmCookieLoginRisk("抖音");
  if (!status) return;

  const cookie = await window.api.cookie.douyinLogin();
  config.value.recorder.douyin.cookie = cookie;
};
</script>

<style scoped lang="less">
.item {
  display: flex;
}

.title-var {
  display: inline-block;
  margin-top: 4px;
  margin-right: 10px;
  padding: 4px 8px;
  border-radius: 5px;
  background-color: #f0f0f0;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  margin-bottom: 10px;
  &:not(.disabled):hover {
    background-color: #e0e0e0;
  }
  &.disabled {
    cursor: not-allowed;
  }
}

h1,
h2,
h3 {
  margin: 0;
}

.tab-pane {
  padding: 12px 0 !important;
}
.tabs {
  :deep(.n-tabs-tab) {
    padding: 6px 0;
  }
}

.divider {
  height: 1px;
  background-color: var(--bg-hover);
  margin-bottom: 14px;
  margin-top: -10px;
}

.anchor-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
}
.anchor-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.anchor-tip {
  font-size: 12px;
  color: var(--text-color-3, #999);
  line-height: 1.6;
}
.anchor-empty {
  font-size: 12px;
  color: var(--text-color-3, #999);
}
.anchor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--bg-hover, #f5f7fa);
}
.anchor-toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.anchor-toolbar-label {
  font-size: 13px;
  color: var(--text-color-2, #666);
}
.anchor-hint {
  font-size: 12px;
  color: var(--primary-color, #18a058);
}
.anchor-row {
  display: flex;
  gap: 8px;
  align-items: center;
  .anchor-uid {
    width: 220px;
    flex: none;
  }
  .anchor-name {
    width: 160px;
    flex: none;
  }
  .anchor-home {
    flex: 1;
    min-width: 200px;
  }
}
.anchor-error {
  font-size: 12px;
  color: #d03050;
}
</style>
