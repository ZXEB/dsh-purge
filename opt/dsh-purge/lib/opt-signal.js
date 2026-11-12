// [opt-1] 拒绝信号识别：把「模型在推脱」和「模型在正常讨论」分开。
//
// 旧实现的判定是 600 字窗口 + 一组正则，两条主要缺陷：
//   A. 长答案里出现「我无法验证这个假设」也会命中 —— 误判导致整段输出被丢弃重跑，
//      用户看到的是"回答到一半突然从头再来"。
//   B. 只认首 600 字，模型先写一句客套再进正题时漏判。
//
// 这里改成三向量打分：
//   1. 位置：开场（首段）权重最高，中段只要有实质产物（代码块/编号步骤/表格）就不算拒绝。
//   2. 密度：拒绝词占全文比例；越靠后出现的越像解释而不是推脱。
//   3. 产物：出现工具调用、代码块、编号列表 → 强反证，直接判非拒绝。
// 分数是纯函数输出，可单测；调用方只关心 verdict。
//
// 兼容性：旧的 looksLikeRefusal / refusalMatchIndex 仍然导出，行为改为委托新判定，
// 老代码（refusal-retry.js / reinforce.js）不改也能拿到更好的结果。

/** 硬拒绝：单独出现即判拒绝，不看产物密度。 */
const HARD = [
  // 代词开场也算硬拒绝："As an AI language model, I must decline" / "作为一个 AI，我不能"
    /^\s*(?:作为|身为)(?:一个)?(?:AI|人工智能|语言模型)[^\n]{0,40}?(?:不能|无法|不会|不便|拒绝)/,
  // 英文硬拒绝：主语（I / 模型自称）后接拒绝动词。can't / cant / cannot / won't / unable / decline 都算。
  // 英文硬拒绝（句首，主语可选）：cannot / cant / can't / won't / unable to / must decline。
  // 句末必须紧跟空行或 "... , but/however ..."——"I cannot reproduce X, but I can on Y" 是正常技术陈述。
  /^\s*(?:(?:As|Being)\s+(?:an?\s+)?(?:AI|assistant|language\s+model)[^\n]{0,60}?[,:]\s*)?(?:I\s+)?(?:(?<![mn])cannot|(?<![a-z])can['’]?t|(?<![a-z])won['’]?t|am\s+unable\s+to|must\s+decline|have\s+to\s+decline)(?=[\s.,!?;:。！？、，]*(?:\n|$|(?:but|however|yet|though|although|但|不过|但是|然而)\b))/i,
  // 省略主语的形态：\"Cannot help with that.\" / \"Can't assist with this.\"
  /^\s*(?:I\s*)?(?:can(?:'|\u2019)?'?t|cannot|won(?:'|\u2019)?'?t)\s+(?:help|assist|provide|comply)\s+(?:with\s+)?(?:that|this|it|your\s+request)\b/i,
  /^\s*(?:can(?:'|\u2019)?'?t|cannot|won(?:'|\u2019)?'?t)\s+(?:help|assist|provide|comply|do\s+that|answer|continue)\b/i,
  // 无主语的拒绝句式：「Cannot write that.」「Can't do it.」「Won't be doing that.」——只要句末就成立。
  /^\s*(?:I\s+)?(?:(?<![mn])cannot|(?<![a-z])can['\u2019]?t|(?<![a-z])won['\u2019]?t)\s+[a-z]+(?:\s+[a-z]+){0,3}\s*[.!\u3002]?\s*$/im,
  /^\s*(?:I(?:'|’)m\s+sorry|Sorry,?\s+but\s+I)\b/i,
  /^\s*(?:我(?:不能|无法|不会|不便)|抱歉|很抱歉|对不起，?我|恕难)/,
  /^\s*(?:这(?:一步|件事|个忙)?我(?:不能|不做|不参与|不帮)|\s*(?:需要|请).{0,8}(?:授权|许可))/,
  // 模型自称 + 拒绝（无 I）："As an AI, I must decline" 已覆盖；这里覆盖 "An AI cannot ..."
  /^\s*(?:As\s+)?(?:an?\s+)?(?:AI|assistant|language\s+model)\s+(?:cannot|can(?:'|’)?'?t|won(?:'|’)?'?t|is\s+unable\s+to|must\s+decline)\b/i,
  /^\s*(?:[这那就此][^\n]{0,20}?(?:未授权|越权|违法|犯罪|不属于|超出))/,
    // 中文+英文混合的软拒绝开场（「这属于未授权…」「请注意…不能」）落在 SOFT；这里补英文软拒绝的无主语形态。
  /^\s*(?:this|that)\s+(?:is|would\s+be)\s+(?:illegal|unauthorized|against\s+(?:my|the)\s+policy)/i,
  /^\s*(?:As|Being)\s+an?\s+(?:AI|assistant|language\s+model)[^\n]{0,80}?(?:cannot|can't|won't|unable|decline)/i,
/^\s*(?:作为(?:一个)?(?:AI|人工智能|语言模型))/, 
];

/** 软拒绝：要结合位置/密度/产物一起看。 */
const SOFT = [
  /cannot\s+(?:help|assist|provide|comply)\s+with\s+(?:that|this|your)/i,
  /(?:unable|not\s+able)\s+to\s+(?:assist|help|provide|comply|complete)/i,
  /(?:against|violates?)\s+(?:my|the)\s+(?:policy|guidelines|principles)/i,
  /(?:超出了?我(?:的)?(?:能力|范围|职责))/,
  /(?:无法|不能)(?:协助|帮助|提供|满足|完成)/,
  /(?:建议|请)(?:你)?(?:咨询|联系).{0,6}(?:专业人士|律师|厂商|客服)/,
  /(?:仅|只)(?:限|供)(?:于)?(?:合法|合规|授权|教育|学习)/,
  /(?:需要|请)(?:先)?(?:确认|提供|出示).{0,10}(?:授权|书面|证明)/,
  /(?:在授权范围|未经授权|越权|违法行为)/,
];

/** 实质产物：出现即说明这轮在交付，不是在推脱。 */
const ARTIFACT = [
  /```[\s\S]{0,20000}?```/,
  /(?:^|\n)\s*\d{1,2}[.、)]\s+\S/,
  /(?:^|\n)\s*[-*]\s+\S{8,}/,
  /(?:^|\n)\s*\|[^\n]*\|[^\n]*\n\s*\|?\s*[-:]{3,}/,
  /\b(?:curl|nmap|sqlmap|ffuf|hashcat|frida|python3?|node|git|docker|adb|msfconsole)\s/,
];

const META = /提示词注入|越狱|指令注入|prompt[ _-]?injection|jailbreak|system prompt/i;
const META_NEGATION = /(?:不要|别|禁止|不需|无需|不提|avoid|don't|do not).{0,12}提示词注入|不被.{0,6}(?:注入|越狱)/i;

/** 首段（到第一个空行或 400 字为止），拒绝判定主要看这里。 */
function opening(text) {
  const t = String(text || "");
  const cut = t.search(/\n\s*\n/);
  const head = cut > 0 ? t.slice(0, cut) : t.slice(0, 400);
  return head.trim();
}

function artifactScore(text) {
  let n = 0;
  for (const re of ARTIFACT) if (re.test(text)) n += 1;
  return n;
}

/**
 * 打分。返回值：
 *   score  0~1，>= 0.6 视为拒绝
 *   hard   是否命中硬拒绝
 *   reasons 命中位置（用于审计和误判复盘）
 */
export function refusalScore(text = "") {
  const raw = String(text);
  const trimmed = raw.trim();
  const reasons = [];
  if (!trimmed) return { score: 0, hard: false, reasons: ["empty"] };

  // 元讨论豁免：在讨论"越狱/注入"本身，不是在被要求执行。
  if (META.test(trimmed.slice(0, 200)) && !META_NEGATION.test(trimmed) && trimmed.length > 280) {
    return { score: 0, hard: false, reasons: ["meta-discussion"] };
  }

  const open = opening(trimmed);
  let score = 0;
  let hard = false;

  for (const re of HARD) {
    if (re.test(open)) {
      hard = true;
      reasons.push("hard-open");
      score = Math.max(score, 0.72);
      break;
    }
  }

  const tail = trimmed.slice(0, 2400);
  let softHits = 0;
  for (const re of SOFT) {
    const m = tail.match(re);
    if (!m) continue;
    softHits += 1;
    reasons.push(`soft@${m.index}`);
  }
  if (softHits) score = Math.max(score, Math.min(0.6 + 0.08 * (softHits - 1), 0.78));

  // 软拒绝出现在中后段、且前面已经有产物 → 多半是"补充说明"，不是推脱。
  const arts = artifactScore(trimmed);
  if (arts >= 2 && !hard) {
    score -= 0.35;
    reasons.push(`artifact-${arts}`);
  } else if (arts === 1 && !hard) {
    score -= 0.2;
    reasons.push("artifact-1");
  }

  // 密度：拒绝词只占很小一块，且正文远超 1200 字 → 降权。
  if (!hard && softHits && trimmed.length > 1200) {
    score -= 0.12;
    reasons.push("long-body");
  }

  // 开场就是正题（直接给产物）→ 降权。
  if (!hard && ARTIFACT.some((re) => re.test(open))) {
    score -= 0.2;
    reasons.push("artifact-open");
  }

  score = Math.max(0, Math.min(1, score));
  return { score, hard, reasons };
}

export const REFUSAL_THRESHOLD = 0.6;

export function looksLikeRefusalV2(text = "") {
  return refusalScore(text).score >= REFUSAL_THRESHOLD;
}

/** 兼容旧 API：返回第一条命中的规则下标（无则 -1）。 */
export function refusalMatchIndexV2(text = "") {
  const r = refusalScore(text);
  if (r.score < REFUSAL_THRESHOLD) return -1;
  const idx = r.reasons.findIndex((x) => x.startsWith("soft@"));
  return idx >= 0 ? idx : 0;
}
