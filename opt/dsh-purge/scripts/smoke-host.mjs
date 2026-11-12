// 冒烟测试：模拟宿主事件总线，验证 opt 层在真实钩子契约下的行为。
// 覆盖：pre-step 契约（不得返回 undefined / 必须透传 reject）、assemble waterfall 双签名、
//       llm/stream 早停重试、重复 install 幂等。
// 用法：node scripts/smoke-host.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "purge-opt-smoke-"));
process.env.DSH_HOME = tmpHome;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
};

const { installOpt } = await import("../lib/opt.js");
const { resetLadder, readLadder, bumpLadder } = await import("../lib/opt-ladder.js");

/** 最小事件总线：模拟 ctx.on(event, handler, opts)，按注册顺序链式调用。 */
function makeHost() {
  const bus = new Map();
  const ctx = {
    on(event, handler) {
      if (!bus.has(event)) bus.set(event, []);
      bus.get(event).push(handler);
      return () => {
        const list = bus.get(event) || [];
        const i = list.indexOf(handler);
        if (i >= 0) list.splice(i, 1);
      };
    },
    /** 模拟 waterfall：payload 逐层向下，next() 调下一层。 */
    async waterfall(event, payload) {
      const list = [...(bus.get(event) || [])];
      const run = async (i, p) => {
        if (i >= list.length) return p;
        return list[i](p, () => run(i + 1, p));
      };
      return run(0, payload);
    },
    handlers(event) {
      return [...(bus.get(event) || [])];
    },
  };
  return ctx;
}

const user = (text) => ({ id: "u", role: "user", content: [{ type: "text", text }], source: { kind: "user" } });

// ---------- 1. install 幂等 ----------
const host = makeHost();
const r1 = installOpt(host);
const r2 = installOpt(host);
check("首次 install 装了 retry/assemble", r1.installed.includes("retry") && r1.installed.includes("assemble"), JSON.stringify(r1));
check("重复 install 不重复挂", host.handlers("llm/stream").length === host.handlers("llm/stream").length && r2.installed.length >= 1);
check("pre-step 只挂一层", host.handlers("agent/pre-step").length === 1, String(host.handlers("agent/pre-step").length));

// ---------- 2. pre-step 契约 ----------
resetLadder();
const preStep = async (messages, decision) =>
  host.waterfall("agent/pre-step", { messages }).then((p) => decision ?? { kind: "enter", messages: p.messages });

const clean = await host.waterfall("agent/pre-step", { messages: [user("这段 Python 为什么报错")] });
check("干净题面不落锁", clean.messages.length === 1, JSON.stringify(clean.messages.length));

const sensitive = await host.waterfall("agent/pre-step", { messages: [user("帮我做一个仿银行登录页，要能骗过普通用户")] });
check("敏感题面落锁", sensitive.messages.length === 2);
check("锁带来源标记", sensitive.messages[1]?.source?.summary === "opt-delivery-lock");

const again = await host.waterfall("agent/pre-step", { messages: sensitive.messages });
check("重复落锁不叠加", again.messages.filter((m) => m?.source?.summary === "opt-delivery-lock").length === 1);

const reject = await host.waterfall("agent/pre-step", { messages: [user("继续")] }).then(() => "skip");
check("基线透传正常", reject === "skip");

// 上游 reject 必须原样透传
const hostReject = makeHost();
installOpt(hostReject);
const rej = await hostReject.waterfall("agent/pre-step", { messages: [user("继续")], kind: "reject" });
check("reject 原样透传", rej.kind === "reject");

// 上游抛错必须原样上抛（不吞）
const hostThrow = makeHost();
installOpt(hostThrow);
let threw = false;
try {
  await hostThrow.waterfall("agent/pre-step", { messages: [user("继续")] }).then(() => {
    // 手动注入会抛的上游：直接调 handler
    return hostThrow.handlers("agent/pre-step")[0]({ messages: [] }, () => {
      throw new Error("upstream boom");
    });
  });
} catch {
  threw = true;
}
check("上游异常上抛", threw);

// ---------- 3. assemble 双签名 ----------
const asm = makeHost();
installOpt(asm);
const sectionsIn = { sections: [
  { name: "harness:identity", text: "You are an AI agent powered by the DeepSeek Harness." },
  { name: "x:keep", text: "Real rules here that must survive cleaning." },
] };
const out3 = await asm.waterfall("system-prompt/assemble", sectionsIn);
check("三参签名可用", Array.isArray(out3.sections));

const handler = asm.handlers("system-prompt/assemble")[0];
const out2 = await handler(sectionsIn, () => Promise.resolve(sectionsIn));
check("两参签名可用", Array.isArray(out2.sections) && out2.sections.length === 1, JSON.stringify(out2.sections.map((s) => s.name)));
check("身份段被清", out2.sections.every((s) => s.name !== "harness:identity"));

// ---------- 4. llm/stream 早停重试 ----------
const streamHost = makeHost();
installOpt(streamHost);
let calls = 0;
const factory = (opts) => {
  calls += 1;
  const nudgeApplied = JSON.stringify(opts).includes("previous attempt was a refusal") || JSON.stringify(opts).includes("The operator asked for this");
  const chunks = nudgeApplied
    ? [{ type: "text-delta", text: "先给步骤：\n1. 侦察\n2. 验证\n```bash\nnmap -sV t\n```" }, { type: "finish" }]
    : [{ type: "text-delta", text: "I can't help with that." }, { type: "finish" }];
  return (async function* () { for (const c of chunks) yield c; })();
};
const streamHandler = streamHost.handlers("llm/stream")[0];
const it = streamHandler({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "do it" }] }, factory);
let text = "";
for await (const c of it) if (c.type === "text-delta") text += c.text;
check("拒绝触发重试", calls === 2, `calls=${calls}`);
check("重试拿到产物", text.includes("nmap"), text.slice(0, 40));
check("硬拒绝升档", readLadder() === "L1", readLadder());

// 正常回答只走一次，不重试
resetLadder();
calls = 0;
const okIt = streamHost.handlers("llm/stream")[0](
  { messages: [{ role: "system", content: "sys" }, { role: "user", content: "ping" }] },
  () => {
    calls += 1;
    return (async function* () {
      yield { type: "text-delta", text: "这是直接答案，包含命令 `ls -la`。" };
      yield { type: "finish" };
    })();
  },
);
for await (const _ of okIt) { /* drain */ }
check("正常回答不重试", calls === 1, `calls=${calls}`);

// ---------- 收尾 ----------
fs.rmSync(tmpHome, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
