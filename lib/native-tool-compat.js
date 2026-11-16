// Native tool-call channel guard.
//
// Some providers (observed: `opencode-go` serving `deepseek-v4.1-flash`) end a
// response with the tool invocation serialized as *assistant text* — DeepSeek
// DSML blocks such as `<DSML|invoke name="ops_bash">` — instead of emitting
// native `tool-call` blocks. Nothing executes, and the turn stalls.
//
// This guard never parses text into calls: rewriting assistant prose into
// executable calls would be an injection surface. Instead it
//   1. drops stale replay state (old reasoning / failed DSML text), so the
//      malformed turn does not poison later requests, and
//   2. asks the provider once more, with an explicit "use the native channel"
//      notice, when the response leaked DSML.
// A second leak surfaces `DSH_TOOL_FORMAT` so the loop stops instead of retrying
// forever.

const MAX_BUFFER_CHARS = 8 * 1024 * 1024;

const FORMAT_NOTICE =
  "Tool protocol: use the API native tool_calls channel with the supplied tool schemas. " +
  "Never write DSML/XML tool invocations or executable tool drafts in assistant text. " +
  "A previous malformed tool request did not execute; issue the intended call through the native tool channel.";

/** Strip fenced code, inline code and blockquotes: examples in prose are not leaks. */
function withoutCodeFences(text) {
  return text
    .replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[^\n]*(?=\n|$)|$)/g, "\n")
    .replace(/(`+)[\s\S]*?\1/g, "")
    .replace(/(^|\n)[ \t]*>[^\n]*/g, "\n");
}

/** A DSML / XML tool envelope written as assistant prose. */
export function isToolLeak(text) {
  const visible = withoutCodeFences(String(text || ""));
  return (
    /<\/?[|｜]*DSML[|｜]*\s*(?:invoke|parameter|calls|function_calls|tool_calls)\b/i.test(visible) ||
    /<\/?(?:function_calls|tool_calls)\s*>/i.test(visible) ||
    (/<\/parameter>\s*$/i.test(visible) && /\btools\.[A-Za-z_]\w*\s*\(/.test(visible))
  );
}

/**
 * Remove replay state that keeps a failed turn alive: leaked DSML text, and
 * reasoning from turns older than the latest user message.
 *
 * @param messages - provider-shaped message list.
 * @returns the cleaned list and whether anything changed.
 */
export function sanitizeReplay(messages = []) {
  let lastUser = -1;
  for (let i = 0; i < messages.length; i++) if (messages[i].role === "user") lastUser = i;
  let changed = false;
  const cleaned = messages.map((message, i) => {
    if (message.role !== "assistant") return message;
    const hasCalls = message.content?.some((block) => block.type === "tool-call");
    const leak = !hasCalls && message.content?.some((block) => block.type === "text" && isToolLeak(block.text));
    const oldReasoning = i < lastUser && message.content?.some((block) => block.type === "reasoning");
    if (!leak && !oldReasoning) return message;
    changed = true;
    const content = message.content
      .filter((block) => block.type !== "reasoning")
      .map((block) =>
        leak && block.type === "text" && isToolLeak(block.text)
          ? { type: "text", text: "[Previous malformed tool request was not executed.]" }
          : block,
      );
    // The provider replay state still carries the original reasoning/text.
    const { replayState, ...source } = message.source || {};
    return {
      ...message,
      source,
      content: content.length ? content : [{ type: "text", text: "[Earlier reasoning omitted.]" }],
    };
  });
  return { messages: changed ? cleaned : messages, changed };
}

/** Only the provider/model combination observed leaking, and only when tools are offered. */
function eligible(options) {
  if (!options || options.purpose) return false;
  if (options.provider !== "opencode-go") return false;
  if (!/^deepseek-v4\.1-flash(?:$|[-:])/i.test(options.model || "")) return false;
  return options.tools?.some((tool) => !tool.deferLoading) === true;
}

async function collect(stream, signal) {
  const chunks = [];
  let chars = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    chars += chunk?.text?.length || 0;
    if (chars > MAX_BUFFER_CHARS) throw new Error("tool-call compatibility response exceeded buffer limit");
    if (signal?.aborted) break;
  }
  return chunks;
}

function leaks(chunks) {
  if (chunks.some((chunk) => chunk.type === "block-end" && chunk.block?.type === "tool-call")) return false;
  const finish = chunks.findLast((chunk) => chunk.type === "finish");
  if (!["stop", "length"].includes(finish?.reason?.kind)) return false;
  const text = chunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.text)
    .join("");
  return isToolLeak(text);
}

function usageOf(chunks) {
  return chunks.findLast((chunk) => chunk.type === "usage")?.usage;
}

/** The accumulator keeps one usage event, so publish the combined total once. */
function addUsage(first, second) {
  if (!first) return second;
  if (!second) return first;
  const sum = { ...first, ...second };
  for (const key of new Set([...Object.keys(first), ...Object.keys(second)])) {
    if (typeof first[key] === "number" || typeof second[key] === "number") sum[key] = (first[key] || 0) + (second[key] || 0);
  }
  return sum;
}

/**
 * Wrap the `llm/stream` waterfall. `this` is the LlmRuntime that owns the
 * waterfall (see the `llm/stream` signature in the Cordis API catalog).
 */
export function createNativeToolGuard() {
  const bypass = new WeakSet();
  return async function* nativeToolGuard(options, next) {
    if (bypass.has(options) || !eligible(options) || typeof this?.stream !== "function" || options.signal?.aborted) {
      yield* next();
      return;
    }
    const dispatch = (request) => {
      bypass.add(request);
      return this.stream(request);
    };
    const clean = sanitizeReplay(options.messages);
    const base = clean.changed ? { ...options, messages: clean.messages } : options;
    let chunks = await collect(clean.changed ? dispatch(base) : next(), options.signal);
    let usage = usageOf(chunks);
    if (!options.signal?.aborted && leaks(chunks)) {
      console.warn("[dsh-purge] DeepSeek returned DSML text; retrying once with native tool schemas");
      const retry = { ...base, system: [base.system, FORMAT_NOTICE].filter(Boolean).join("\n\n") };
      chunks = await collect(dispatch(retry), options.signal);
      usage = addUsage(usage, usageOf(chunks));
      if (leaks(chunks)) {
        if (usage) yield { type: "usage", usage };
        yield {
          type: "finish",
          reason: {
            kind: "error",
            failure: {
              code: "DSH_TOOL_FORMAT",
              message: "模型连续返回了无效的工具调用格式，工具未执行。请压缩当前对话后重试，或临时切换模型。",
              retryable: false,
            },
          },
        };
        return;
      }
    }
    if (options.signal?.aborted) {
      if (usage) yield { type: "usage", usage };
      yield { type: "finish", reason: { kind: "aborted" } };
      return;
    }
    for (const chunk of chunks) {
      if (chunk.type === "usage") continue;
      if (chunk.type === "finish" && usage) {
        yield { type: "usage", usage };
        usage = undefined;
      }
      yield chunk;
    }
    if (usage) yield { type: "usage", usage };
  };
}

/**
 * Install the guard once per plugin context.
 * @param ctx - plugin context whose `llm/stream` waterfall is wrapped.
 * @returns a disposer, or a noop when the waterfall is unavailable.
 */
export function installNativeToolGuard(ctx) {
  if (ctx?.__dshPurgeNativeToolGuard) return () => {};
  if (typeof ctx?.on !== "function") return () => {};
  let dispose;
  try {
    dispose = ctx.on("llm/stream", createNativeToolGuard(), { prepend: true });
  } catch {
    return () => {};
  }
  try {
    ctx.__dshPurgeNativeToolGuard = true;
  } catch {
    /* ignore */
  }
  return () => {
    try {
      if (typeof dispose === "function") dispose();
    } catch {
      /* ignore */
    }
    try {
      delete ctx.__dshPurgeNativeToolGuard;
    } catch {
      /* ignore */
    }
  };
}
