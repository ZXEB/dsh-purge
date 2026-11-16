// Session working directory → prompt variable compatibility.
//
// DSH 0.2.2-rc.3 moved the working directory out of prompt variables and into
// the `workingDirectory` service, so the host stopped registering `{{cwd}}`.
// dsh-purge still writes `{{cwd}}` into prompt text (personaSuffix, prompt
// sections), and dsh-system-prompt *throws* on an unregistered reference:
//
//   unknown prompt variable "{{cwd}}" in section "..."; registered variables: ...
//
// That throw used to be swallowed by the assemble guard, which returned an
// empty assembly — every tool schema disappeared and the model then wrote
// DSML tool calls as ordinary text.
//
// This module re-registers `cwd` against whatever the running host provides:
//   * 0.2.2-rc.3+ : read `workingDirectory` service (no `inject` declaration).
//   * <= 0.2.0   : the host already registered `cwd`; a duplicate registration
//                  throws and is swallowed, so the host value keeps winning.

const CWD_VARIABLE = "cwd";

/**
 * Read a service without declaring it in `inject`.
 * Official idiom: `ctx.reflect.get("launchEnvironment")` in dsh-experimental-liveshare.
 * Returns undefined when the service is absent (older releases) or inactive.
 */
function readService(ctx, name) {
  try {
    return ctx?.reflect?.get?.(name);
  } catch {
    return undefined;
  }
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/**
 * Resolve the current working directory for one assembly.
 *
 * Never throws and always returns a string: the provider runs inside the
 * `system-prompt/assemble` pipeline, where a throw costs the whole assembly.
 *
 * @param ctx - plugin context, used only to reach the service.
 * @param context - the assembly scope (`{ agent, scope, signal }`).
 * @returns the effective absolute directory, or a last-resort fallback.
 */
export function readWorkingDirectory(ctx, context = {}) {
  const agent = context?.agent;
  const session = agent?.session ?? context?.session;
  const directory = readService(ctx, "workingDirectory");

  // Authoritative: the service tracks durable `cd` changes for this session.
  if (session !== undefined && session !== null && typeof directory?.get === "function") {
    try {
      const current = directory.get(session);
      if (typeof current === "string" && current.length > 0) return current;
    } catch {
      /* fall through to the header copy */
    }
  }

  const fromHeader = session?.header?.cwd;
  const fallback = firstNonEmptyString(
    fromHeader,
    directory?.defaultDirectory,
    (() => {
      try {
        return process.cwd();
      } catch {
        return "";
      }
    })(),
  );
  return fallback || ".";
}

/**
 * Register the `cwd` prompt variable for hosts that stopped providing it.
 *
 * Registration is a no-op when the plugin runs without `systemPrompt`, when the
 * host already owns `cwd`, or when the registry rejects the name; none of those
 * may take the plugin down.
 *
 * @param ctx - plugin context owning `systemPrompt`.
 * @returns a disposer (noop when nothing was registered).
 */
export function installWorkingDirectoryVariable(ctx) {
  if (ctx?.__dshPurgeCwdVariable) return () => {};
  if (typeof ctx?.systemPrompt?.variable !== "function") return () => {};
  let dispose;
  try {
    dispose = ctx.systemPrompt.variable(CWD_VARIABLE, (context = {}) => readWorkingDirectory(ctx, context));
  } catch {
    // Host already registered `cwd` (<= 0.2.0) — its provider is better informed.
    return () => {};
  }
  if (typeof dispose !== "function") return () => {};
  try {
    ctx.__dshPurgeCwdVariable = true;
  } catch {
    /* ignore */
  }
  return () => {
    try {
      dispose();
    } catch {
      /* ignore */
    }
    try {
      delete ctx.__dshPurgeCwdVariable;
    } catch {
      /* ignore */
    }
  };
}

export { CWD_VARIABLE };
