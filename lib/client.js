window.__ModuleLoader__.load({
  id: "@amyaxy/dsh-prompt-boost-model",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const reactDom = require("react-dom");

    /** Locale namespace of this half; also the slot registrations' `locale`. */
    const NS = "dsh-prompt-boost-model";

    /** Route prefix of the Host routes this half calls. */
    const ROUTE = "/plugins/dsh-prompt-boost-model";

    /**
     * Settings mirrored from the Host defaults.
     *
     * The first frame renders before the Host answers `GET /state`, so a stale
     * or missing mirror must still be a usable form. Keep in step with
     * `DEFAULT_SETTINGS` in `lib/index.js`.
     */
    const DEFAULTS = {
      enabled: true,
      provider: "",
      model: "",
      temperature: 0.3,
      maxOutputTokens: 4096,
      timeoutMs: 60000,
      systemPrompt: "",
    };

    /** Keys the settings page may write; anything else is dropped host-side. */
    const WRITABLE = ["enabled", "provider", "model", "temperature", "maxOutputTokens", "timeoutMs", "systemPrompt"];

    /** Separator inside one <option> value carrying the provider/model pair. */
    const PAIR = "\u0000";

    const TEXT = {
      en: {
        "nav.title": "Prompt Boost",
        "section.title": "Prompt Boost",
        "section.subtitle": "Improve the composer draft before sending it. Choose which model does the rewriting.",
        "field.enabled": "Enable prompt boost",
        "field.enabled.hint": "Shows the boost button in the composer.",
        "field.enabled.on": "On",
        "field.enabled.off": "Off",
        "field.model": "Enhancement model",
        "field.model.hint": "The model used to rewrite drafts. The harness default is used when unset.",
        "field.model.inherit": "Follow the default model",
        "field.model.loading": "Loading available models…",
        "field.model.empty": "No models are available yet. Configure a provider first.",
        "field.model.default": "Default",
        "field.temperature": "Temperature",
        "field.temperature.hint": "Lower values keep the rewrite closer to your original wording.",
        "field.maxOutputTokens": "Max output tokens",
        "field.timeoutMs": "Timeout (ms)",
        "field.systemPrompt": "Custom instructions",
        "field.systemPrompt.hint": "Leave empty to use the built-in rewriting strategy.",
        "field.systemPrompt.placeholder": "Extra rules for this plugin only…",
        "action.save": "Save",
        "action.saving": "Saving…",
        "action.saved": "Saved",
        "action.reset": "Reset to defaults",
        "button.boost": "Boost",
        "button.boost.title": "Rewrite this draft into a precise prompt",
        "button.boost.busy": "Boosting…",
        "button.boost.empty": "Type a draft first.",
        "panel.title": "Boosted prompt",
        "panel.apply": "Use this",
        "panel.discard": "Discard",
        "panel.undo": "Undo",
        "panel.undone": "Reverted to your original draft.",
        "panel.error": "Could not boost the prompt",
        "error.network": "The host is unreachable.",
        "error.unconfigured": "Pick an enhancement model in Settings first.",
      },
      zh: {
        "nav.title": "增强提示词",
        "section.title": "增强提示词",
        "section.subtitle": "发送前先改进输入框草稿，并可指定由哪个模型来完成改写。",
        "field.enabled": "启用增强提示词",
        "field.enabled.hint": "在输入框显示增强按钮，并启用快捷键。",
        "field.enabled.on": "已开启",
        "field.enabled.off": "已关闭",
        "field.model": "增强所用模型",
        "field.model.hint": "用于改写草稿的模型；未选择时跟随默认模型。",
        "field.model.inherit": "跟随默认模型",
        "field.model.loading": "正在读取可用模型…",
        "field.model.empty": "暂无可用模型，请先配置一个模型服务商。",
        "field.model.default": "默认",
        "field.temperature": "采样温度",
        "field.temperature.hint": "数值越低，改写越贴近你的原始表述。",
        "field.maxOutputTokens": "输出 token 上限",
        "field.timeoutMs": "超时（毫秒）",
        "field.systemPrompt": "自定义指令",
        "field.systemPrompt.hint": "留空则使用内置改写策略。",
        "field.systemPrompt.placeholder": "仅对本插件生效的额外规则…",
        "action.save": "保存",
        "action.saving": "保存中…",
        "action.saved": "已保存",
        "action.reset": "恢复默认",
        "button.boost": "增强",
        "button.boost.title": "把草稿改写为精准的提示词",
        "button.boost.busy": "增强中…",
        "button.boost.empty": "请先输入草稿。",
        "panel.title": "增强结果",
        "panel.apply": "采用",
        "panel.discard": "放弃",
        "panel.undo": "撤销",
        "panel.undone": "已恢复为原始草稿。",
        "panel.error": "增强失败",
        "error.network": "无法连接宿主服务。",
        "error.unconfigured": "请先在设置中选择增强所用模型。",
      },
    };

    /** Registries are created fresh per run; a module-level cache would leak across reloads. */
    const dictionaries = { zh: TEXT.zh, en: TEXT.en };

    /** The locale this half renders in; kept live by the locale subscription. */
    let language = "en";

    /** Translate one key, falling back to English and then to the raw key. */
    function t(key) {
      const dict = TEXT[language] ?? TEXT.en;
      return dict[key] ?? TEXT.en[key] ?? key;
    }

    /** Resolve the active language from a locale snapshot, tolerating absence. */
    function pickLanguage(snapshot) {
      const active = typeof snapshot?.active === "string" ? snapshot.active.toLowerCase() : "";
      return active.indexOf("zh") === 0 ? "zh" : "en";
    }

    /** Resolve one service from an injected context, tolerating both access forms. */
    function serviceOf(injectedCtx, name) {
      if (injectedCtx === undefined || injectedCtx === null) return undefined;
      const direct = injectedCtx[name];
      if (direct !== undefined) return direct;
      return typeof injectedCtx.get === "function" ? injectedCtx.get(name) : undefined;
    }

    /**
     * Pick the translate function for one component render.
     *
     * The shell passes its own `t` down to slot components and re-renders them on
     * a locale change, so preferring it makes the panel follow a language switch
     * live. That seat is only usable when it actually resolves THIS namespace —
     * a seat bound elsewhere returns the raw key, which would render
     * `section.title` on screen. The probe below therefore trusts the injected
     * function only when it translates a known key, and otherwise falls back to
     * the local dictionary.
     */
    function translatorOf(props) {
      const candidate = props?.t;
      if (typeof candidate !== "function") return t;
      try {
        // A namespace-bound `t` returns its own text; a foreign one echoes the key.
        if (candidate("nav.title") !== "nav.title") return candidate;
      } catch {
        // A throwing seat is worse than no seat.
      }
      return t;
    }

    /* ---------------------------------------------------------------------
     * Styles. One <style> element owned by this run, using the host's theme
     * tokens so light and dark both track the shell.
     * ------------------------------------------------------------------ */
    const CSS = [
      ".dpb-section{display:block;padding:4px 0 8px}",
      ".dpb-row{display:flex;flex-direction:column;gap:6px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dpb-row:last-child{border-bottom:none}",
      ".dpb-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dpb-hint{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}",
      ".dpb-select,.dpb-number,.dpb-textarea{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}",
      ".dpb-select:focus,.dpb-number:focus,.dpb-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}",
      ".dpb-textarea{min-height:88px;resize:vertical;line-height:1.6}",
      ".dpb-inline{display:flex;gap:10px;flex-wrap:wrap}",
      ".dpb-inline>*{flex:1 1 160px}",
      ".dpb-actions{display:flex;gap:10px;align-items:center;padding-top:16px;flex-wrap:wrap}",
      ".dpb-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit}",
      ".dpb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}",
      ".dpb-btn:disabled{opacity:.55;cursor:default}",
      ".dpb-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}",
      ".dpb-btn-primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary)}",
      ".dpb-status{font-size:12px;color:var(--dsw-alias-label-secondary)}",
      ".dpb-status.is-error{color:var(--dsw-alias-state-error-primary)}",
      ".dpb-status.is-ok{color:var(--dsw-alias-state-success-primary)}",
      ".dpb-switch{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}",
      ".dpb-switch input{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:0}",
      /* Composer trigger: a compact pill sized to sit beside the send button. */
      ".dpb-trigger{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap}",
      ".dpb-trigger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".dpb-trigger:disabled{opacity:.45;cursor:default}",
      ".dpb-trigger svg{width:14px;height:14px;display:block}",
      ".dpb-trigger-note{font-size:11px;color:var(--dsw-alias-state-error-primary);margin-left:6px;white-space:nowrap}",
      /* Preview overlay: portalled to <body> because the composer clips overflow. */
      ".dpb-scrim{position:fixed;inset:0;background:rgba(8,10,16,.44);display:flex;align-items:center;justify-content:center;z-index:2147483000;padding:24px}",
      ".dpb-dialog{width:min(720px,100%);max-height:min(78vh,720px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.42);overflow:hidden}",
      ".dpb-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dpb-dialog-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dpb-dialog-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52%}",
      ".dpb-dialog-body{padding:16px 18px;overflow:auto;flex:1}",
      ".dpb-result{margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-primary);font-family:inherit}",
      ".dpb-dialog-foot{display:flex;align-items:center;gap:10px;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1)}",
      ".dpb-spacer{flex:1}",
    ].join("\n");

    /**
     * Insert this run's stylesheet; returns its disposer.
     *
     * Any element left behind by a previous run is removed first: a client
     * reload disposes the old run's effects asynchronously, so without this the
     * document would accumulate one identical <style> per reload.
     */
    function insertStyles() {
      document.querySelectorAll("style[data-dsh-prompt-boost-model]").forEach((stale) => stale.remove());
      const element = document.createElement("style");
      element.setAttribute("data-dsh-prompt-boost-model", "");
      element.textContent = CSS;
      document.head.appendChild(element);
      return function disposeStyles() {
        element.remove();
      };
    }

    /* ---------------------------------------------------------------------
     * Host calls. Same-origin fetch, matching how the host's own pages call
     * their routes; every failure becomes an Error with a readable message so
     * the UI can render it verbatim.
     * ------------------------------------------------------------------ */

    /** Parse one JSON response, converting a non-OK status into a thrown Error. */
    async function readJson(response) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const detail = typeof payload?.error === "string" && payload.error !== "" ? payload.error : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      return payload;
    }

    /** GET the stored settings section. */
    async function getState() {
      return readJson(await fetch(`${ROUTE}/state`, { headers: { accept: "application/json" } }));
    }

    /** GET the selectable model directory. */
    async function getModels() {
      return readJson(await fetch(`${ROUTE}/models`, { headers: { accept: "application/json" } }));
    }

    /** POST one settings patch. */
    async function saveSettings(patch) {
      return readJson(await fetch(`${ROUTE}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }));
    }

    /** POST one draft and wait for the rewrite. */
    async function enhance(text, signal) {
      return readJson(await fetch(`${ROUTE}/enhance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      }));
    }

    /** Coerce a thrown value into display text. */
    function messageOf(failure, fallback) {
      if (failure instanceof Error && failure.message !== "") return failure.message;
      return fallback;
    }

    /* ---------------------------------------------------------------------
     * Settings page (settings.section). A plain form: the model choice is the
     * point of this plugin, so it is a real <select> populated from the live
     * provider directory rather than a free-text field.
     * ------------------------------------------------------------------ */

    /** Render one labelled row. */
    function Row(props) {
      return react.createElement("div", { className: "dpb-row" },
        react.createElement("div", { className: "dpb-label" }, props.label),
        props.hint !== undefined ? react.createElement("div", { className: "dpb-hint" }, props.hint) : null,
        props.children,
      );
    }

    /** The settings page component. */
    function SettingsSection(props) {
      const t = translatorOf(props);
      const [state, setState] = react.useState(DEFAULTS);
      const [directory, setDirectory] = react.useState(null);
      const [status, setStatus] = react.useState("");
      const [error, setError] = react.useState("");
      const [busy, setBusy] = react.useState(false);
      const [loaded, setLoaded] = react.useState(false);

      // Load the stored section and the model directory together: the form is
      // not usable until the second lands, so one loading state covers both.
      react.useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const [stored, models] = await Promise.all([getState(), getModels()]);
            if (cancelled) return;
            if (stored !== null && typeof stored.settings === "object") {
              setState({ ...DEFAULTS, ...stored.settings });
            }
            setDirectory(models);
            setError("");
          } catch (failure) {
            if (cancelled) return;
            setError(messageOf(failure, t("error.network")));
          } finally {
            if (!cancelled) setLoaded(true);
          }
        })();
        return () => { cancelled = true; };
      }, []);

      /** Update one field locally; the write happens on Save. */
      const set = (key) => (event) => {
        const target = event.target;
        const value = target.type === "checkbox" ? target.checked : target.value;
        setState((previous) => ({ ...previous, [key]: value }));
        setStatus("");
      };

      /** Persist the form. */
      const save = async () => {
        setBusy(true);
        setError("");
        try {
          const patch = {};
          for (const key of WRITABLE) patch[key] = state[key];
          const result = await saveSettings(patch);
          if (result !== null && typeof result.settings === "object") {
            setState({ ...DEFAULTS, ...result.settings });
          }
          setStatus(t("action.saved"));
        } catch (failure) {
          setError(messageOf(failure, t("error.network")));
        } finally {
          setBusy(false);
        }
      };

      /** Restore the packaged defaults, then persist them. */
      const reset = async () => {
        setState(DEFAULTS);
        setStatus("");
        setBusy(true);
        setError("");
        try {
          const result = await saveSettings(DEFAULTS);
          if (result !== null && typeof result.settings === "object") {
            setState({ ...DEFAULTS, ...result.settings });
          }
          setStatus(t("action.saved"));
        } catch (failure) {
          setError(messageOf(failure, t("error.network")));
        } finally {
          setBusy(false);
        }
      };

      /**
       * Flatten the provider directory into <optgroup>/<option> nodes.
       *
       * The option value is `provider\0model`, so one select expresses the pair
       * the Host route needs without a second control that can drift out of step.
       */
      const groups = [];
      if (directory !== null && Array.isArray(directory.providers)) {
        for (const provider of directory.providers) {
          const providerName = typeof provider.name === "string" && provider.name !== "" ? provider.name : provider.provider;
          groups.push(react.createElement("optgroup", {
            key: provider.provider,
            label: providerName,
          }, (provider.models ?? []).map((model) => react.createElement("option", {
            key: `${provider.provider}${PAIR}${model.id}`,
            value: `${provider.provider}${PAIR}${model.id}`,
            // The model id is shown beside the display name: several providers
            // expose the same friendly name for different routes, and the id is
            // what the request actually uses.
            title: model.id,
          }, `${typeof model.name === "string" && model.name !== "" ? model.name : model.id} (${model.id})`))));
        }
      }

      const selectedValue = state.provider !== "" && state.model !== "" ? `${state.provider}${PAIR}${state.model}` : "";

      /** Apply one select change back onto the provider/model pair. */
      const onPickModel = (event) => {
        const raw = event.target.value;
        if (raw === "") {
          setState((previous) => ({ ...previous, provider: "", model: "" }));
        } else {
          const cut = raw.indexOf(PAIR);
          setState((previous) => ({
            ...previous,
            provider: cut === -1 ? raw : raw.slice(0, cut),
            model: cut === -1 ? "" : raw.slice(cut + 1),
          }));
        }
        setStatus("");
      };

      const hasProviders = directory !== null && Array.isArray(directory.providers) && directory.providers.length > 0;
      const modelHint = !loaded && directory === null
        ? t("field.model.loading")
        : !hasProviders
          ? t("field.model.empty")
          : t("field.model.hint");

      const fallbackRoute = directory !== null && directory.default !== null && typeof directory.default === "object"
        ? `${directory.default.provider} / ${directory.default.model}`
        : "";

      return react.createElement("div", { className: "dpb-section" },
        react.createElement("div", { className: "dpb-row" },
          react.createElement("div", { className: "dpb-label" }, t("section.title")),
          react.createElement("div", { className: "dpb-hint" }, t("section.subtitle")),
        ),

        react.createElement(Row, { label: t("field.enabled"), hint: t("field.enabled.hint") },
          react.createElement("label", { className: "dpb-switch" },
            react.createElement("input", {
              type: "checkbox",
              checked: state.enabled === true,
              onChange: set("enabled"),
            }),
            react.createElement("span", { className: "dpb-hint" },
              state.enabled === true ? t("field.enabled.on") : t("field.enabled.off")),
          ),
        ),

        react.createElement(Row, {
          label: t("field.model"),
          hint: fallbackRoute === "" ? modelHint : `${modelHint} ${t("field.model.default")}: ${fallbackRoute}`,
        },
          react.createElement("select", { className: "dpb-select", value: selectedValue, onChange: onPickModel },
            react.createElement("option", { value: "" }, t("field.model.inherit")),
            groups,
          ),
        ),

        react.createElement(Row, { label: t("field.temperature"), hint: t("field.temperature.hint") },
          react.createElement("input", {
            className: "dpb-number", type: "number", min: 0, max: 1, step: 0.05,
            value: state.temperature, onChange: set("temperature"),
          }),
        ),

        react.createElement(Row, { label: `${t("field.maxOutputTokens")} / ${t("field.timeoutMs")}` },
          react.createElement("div", { className: "dpb-inline" },
            react.createElement("input", {
              className: "dpb-number", type: "number", min: 256, max: 32768, step: 1,
              value: state.maxOutputTokens, onChange: set("maxOutputTokens"),
            }),
            react.createElement("input", {
              className: "dpb-number", type: "number", min: 5000, max: 600000, step: 1000,
              value: state.timeoutMs, onChange: set("timeoutMs"),
            }),
          ),
        ),

        react.createElement(Row, { label: t("field.systemPrompt"), hint: t("field.systemPrompt.hint") },
          react.createElement("textarea", {
            className: "dpb-textarea",
            value: state.systemPrompt,
            placeholder: t("field.systemPrompt.placeholder"),
            onChange: set("systemPrompt"),
          }),
        ),

        react.createElement("div", { className: "dpb-actions" },
          react.createElement("button", {
            className: "dpb-btn dpb-btn-primary", type: "button",
            disabled: busy, onClick: save,
          }, busy ? t("action.saving") : t("action.save")),
          react.createElement("button", {
            className: "dpb-btn", type: "button", disabled: busy, onClick: reset,
          }, t("action.reset")),
          react.createElement("div", { className: "dpb-spacer" }),
          error !== ""
            ? react.createElement("div", { className: "dpb-status is-error" }, error)
            : status !== ""
              ? react.createElement("div", { className: "dpb-status is-ok" }, status)
              : null,
        ),
      );
    }

    /* ---------------------------------------------------------------------
     * Composer button (conversation.input.right) and its preview overlay.
     * ------------------------------------------------------------------ */

    /** The bolt glyph, drawn inline so the package ships no asset dependency. */
    function BoltIcon() {
      return react.createElement("svg", {
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9,
        strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      }, react.createElement("path", { d: "M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" }));
    }

    /** One composer's boost trigger plus the preview overlay it opens. */
    function BoostButton(props) {
      const { useInput, inputActions } = props;
      const t = translatorOf(props);

      // Read the draft defensively: a host generation that renames the field
      // must degrade to "no draft" rather than throw during render, which would
      // take out the whole slot entry behind its error boundary.
      const draft = typeof useInput === "function"
        ? useInput((snapshot) => {
          const value = snapshot?.draft;
          return typeof value === "string" ? value : "";
        })
        : "";

      const [busy, setBusy] = react.useState(false);
      const [shown, setShown] = react.useState(null);
      const [failure, setFailure] = react.useState("");
      const [notice, setNotice] = react.useState("");
      const [undo, setUndo] = react.useState(null);

      // The draft that preceded the last apply, held in a ref because applying
      // must not re-render the button with the *new* draft as the undo target.
      const originalRef = react.useRef("");
      const controllerRef = react.useRef(null);

      // Abort any in-flight request on unmount: the route keeps spending model
      // quota otherwise, and a late result would write into a stale draft.
      react.useEffect(() => () => {
        if (controllerRef.current !== null) controllerRef.current.abort();
      }, []);

      /** Write one draft back into the composer. */
      const writeDraft = (text) => {
        if (typeof inputActions?.setDraft === "function") inputActions.setDraft(text);
      };

      /** Run one enhancement against the current draft. */
      const run = async () => {
        const text = typeof draft === "string" ? draft.trim() : "";
        if (text === "") {
          setNotice(t("button.boost.empty"));
          return;
        }
        setNotice("");
        setFailure("");
        setBusy(true);
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
          const result = await enhance(text, controller.signal);
          if (typeof result?.text === "string" && result.text !== "") {
            originalRef.current = draft;
            setShown({
              text: result.text,
              meta: [result.provider, result.model]
                .filter((part) => typeof part === "string" && part !== "")
                .join(" / "),
            });
          } else {
            setFailure(t("panel.error"));
          }
        } catch (error) {
          // An abort is a deliberate cancel, not something to report.
          if (error?.name !== "AbortError") setFailure(messageOf(error, t("error.network")));
        } finally {
          controllerRef.current = null;
          setBusy(false);
        }
      };

      /** Apply the rewrite, remembering the original for Undo. */
      const apply = () => {
        if (shown === null) return;
        setUndo(originalRef.current);
        writeDraft(shown.text);
        setShown(null);
        setNotice("");
      };

      /** Restore the draft that preceded the last apply. */
      const undoApply = () => {
        if (undo === null) return;
        writeDraft(undo);
        setUndo(null);
        setNotice(t("panel.undone"));
      };

      const canBoost = typeof draft === "string" && draft.trim() !== "";

      const overlay = shown === null ? null : react.createElement("div", {
        className: "dpb-scrim",
        onClick: (event) => { if (event.target === event.currentTarget) setShown(null); },
      },
        react.createElement("div", { className: "dpb-dialog", role: "dialog", "aria-modal": "true" },
          react.createElement("div", { className: "dpb-dialog-head" },
            react.createElement("div", { className: "dpb-dialog-title" }, t("panel.title")),
            react.createElement("div", { className: "dpb-dialog-meta" }, shown.meta),
          ),
          react.createElement("div", { className: "dpb-dialog-body" },
            react.createElement("pre", { className: "dpb-result" }, shown.text),
          ),
          react.createElement("div", { className: "dpb-dialog-foot" },
            react.createElement("button", { className: "dpb-btn", type: "button", onClick: () => setShown(null) },
              t("panel.discard")),
            react.createElement("button", { className: "dpb-btn dpb-btn-primary", type: "button", onClick: apply },
              t("panel.apply")),
          ),
        ),
      );

      // Portal to <body>: the composer card clips overflow, so an in-place
      // overlay would be cut off.
      const portal = overlay !== null && typeof document !== "undefined"
        ? reactDom.createPortal(overlay, document.body)
        : null;

      return react.createElement(react.Fragment, null,
        react.createElement("button", {
          className: "dpb-trigger",
          type: "button",
          title: canBoost ? t("button.boost.title") : t("button.boost.empty"),
          disabled: busy || !canBoost,
          onClick: run,
          "data-dsh-prompt-boost-model": "",
        },
          react.createElement(BoltIcon),
          react.createElement("span", null, busy ? t("button.boost.busy") : t("button.boost")),
        ),
        failure !== "" && shown === null
          ? react.createElement("span", { className: "dpb-trigger-note" }, failure)
          : null,
        notice !== "" && shown === null
          ? react.createElement("span", { className: "dpb-trigger-note" }, notice)
          : null,
        undo !== null && shown === null
          ? react.createElement("button", { className: "dpb-trigger", type: "button", onClick: undoApply },
            t("panel.undo"))
          : null,
        portal,
      );
    }

    /* ---------------------------------------------------------------------
     * Wiring.
     * ------------------------------------------------------------------ */

    /**
     * Register both dictionaries in ONE call.
     *
     * The typed form enforces bilingual balance at registration and owns a
     * single (ns, locale) occupant, so registering per-language would make the
     * second call a duplicate-occupant throw.
     */
    function installLocale(ctx) {
      ctx.inject(["locale"], (localeCtx) => {
        const locale = serviceOf(localeCtx, "locale");
        if (locale === undefined) return;

        ctx.effect(() => {
          try {
            return locale.register(NS, dictionaries);
          } catch (error) {
            console.warn("[prompt-boost] dictionary registration failed; copy falls back to keys.", error);
            return () => {};
          }
        }, "dsh-prompt-boost-model: dictionaries");

        // Track the active language so `t()` and the nav label follow a switch.
        try {
          if (typeof locale.getSnapshot === "function") {
            language = pickLanguage(locale.getSnapshot());
            if (typeof locale.subscribe === "function") {
              ctx.effect(() => {
                const sync = () => {
                  const next = pickLanguage(locale.getSnapshot());
                  if (next !== language) language = next;
                };
                return locale.subscribe(sync);
              }, "dsh-prompt-boost-model: locale tracking");
            }
          }
        } catch (error) {
          console.warn("[prompt-boost] locale tracking failed; copy stays in English.", error);
        }
      });
    }

    /** Register the Settings page. */
    function installSettingsPage(ctx) {
      ctx.inject(["slots"], (slotsCtx) => {
        const slots = serviceOf(slotsCtx, "slots");
        if (slots === undefined) return;
        return slots.inject("settings.section", () => {
          try {
            return slots.register({
              name: "settings.section",
              id: "dsh-prompt-boost-model",
              order: 36,
              // A thunk is re-read on every projection, so the nav label follows
              // the active locale without re-registering.
              label: () => t("nav.title"),
              locale: NS,
              // The seat carries `t` only when the registrant supplies it; the
              // shell does not project its own translator into a section. This is
              // what makes the page follow a language switch live.
              inject: () => ({ t, surface: "settings" }),
            }, SettingsSection);
          } catch (error) {
            console.warn("[prompt-boost] settings page registration failed.", error);
            return () => {};
          }
        });
      });
    }

    /** Register the composer button. */
    function installComposerButton(ctx) {
      ctx.inject(["slots"], (slotsCtx) => {
        const slots = serviceOf(slotsCtx, "slots");
        if (slots === undefined) return;
        return slots.inject("conversation.input.right", () => {
          try {
            return slots.register({
              name: "conversation.input.right",
              id: "prompt-boost",
              order: 61,
              label: () => t("button.boost"),
              locale: NS,
              // The composer seat already projects `t` and the input hooks, so the
              // registration only declares identity here.
            }, BoostButton);
          } catch (error) {
            console.warn("[prompt-boost] composer button registration failed.", error);
            return () => {};
          }
        });
      });
    }

    /**
     * Apply the browser half.
     *
     * Every step is isolated: the shell fails the whole web boot when a client
     * entry throws, so a profile missing any one service must lose only that
     * feature. `inject` is intentionally empty — `ctx.inject` below waits for
     * a service and simply never runs its callback when the service is absent.
     */
    function apply(ctx) {
      const disposers = [];

      try {
        disposers.push(insertStyles());
      } catch (error) {
        console.warn("[prompt-boost] stylesheet insertion failed.", error);
      }

      for (const [install, label] of [
        [installLocale, "locale"],
        [installSettingsPage, "settings page"],
        [installComposerButton, "composer button"],
      ]) {
        try {
          const dispose = install(ctx);
          if (typeof dispose === "function") disposers.push(dispose);
        } catch (error) {
          console.warn(`[prompt-boost] ${label} wiring failed.`, error);
        }
      }

      if (typeof ctx.effect === "function") {
        ctx.effect(() => () => {
          for (const dispose of disposers.splice(0)) {
            try { dispose(); } catch { /* one bad disposer must not block the rest */ }
          }
        }, "dsh-prompt-boost-model: teardown");
      }
    }

    exports.apply = apply;
    exports.NS = NS;
    return module.exports;
  }
});
