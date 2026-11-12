// [opt] 宿主适配器：Cordis 插件，承担"把 opt 层挂到原 dsh-purge 的 ctx 上"。
//
// 为什么需要它：ESM 的导出绑定只读，往插件 lib/index.js 追加 `apply = ...` 会在严格模式
// 抛 TypeError；而宿主只按 cordis.patch.yml 里 name 指向的模块调 apply()。
// 所以由这个独立插件模块承担"额外的 apply"，注册顺序由 patch 里的位置决定
// （排在原插件 insert 行之后），各层共用同一个 ctx。
//
// 幂等：重复 install 靠各层自带的 ctx.__dshPurgeOpt* 标记去重。
import { installOpt } from "./opt.js";

export const name = "dsh-purge-opt";
export const inject = ["systemPrompt", "tools"];

/**
 * 宿主按 cordis.patch.yml 里 `name: '<pkg>/opt-companion'` 加载本模块，然后把 config 传进来。
 *   base     —— 原插件入口模块说明符；本适配器不 import 它（原插件仍由宿主自己的 insert 行加载），
 *               保留字段只为排障时能看出搭档对象。
 *   priority —— 建议值 after：让原插件的 pre-step / assemble 钩子先注册，
 *               本层的锁与装配改写才能覆盖到它产出的结果。
 *   opt      —— 可选，覆盖 $DSH_HOME/dsh-purge/opt.json（一般不用）。
 */
export function apply(ctx, config = {}) {
  const report = installOpt(ctx, config || {});
  if (report?.warnings?.length) {
    try {
      console.warn("[dsh-purge-opt] 部分层未挂上：", report.warnings.join(" | "));
    } catch { /* 控制台不可用时忽略 */ }
  }
  return report;
}
