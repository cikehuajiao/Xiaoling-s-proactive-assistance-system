/**
 * 小玲 · 语音指令唤醒
 * 基于 Web Speech API（Chrome / Edge 支持），连续聆听语音指令：
 *   "开启主动陪伴" → 开启陪伴；  "关闭陪伴" → 关闭
 *   "打开网易云 / 抖音 / B站" → 一键打开平台
 *   "打开 / 关闭摄像头" → 摄像头开关； "小玲" → 唤醒打招呼
 * 识别到指令后，小玲用气泡 + 语音（TTS）双重回应。全程本地识别，不上传任何音频。
 */

(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;
  const btn = document.getElementById("btnVoice");
  const camBtn = document.getElementById("btnCam");
  if (!btn) return;

  // 指令表：优先级从高到低，命中即执行
  const COMMANDS = [
    { re: /(关闭|停止|关掉).*(陪伴|看着我)/, action: () => stopCompanion(), reply: "好的，我先休息啦～想我的时候再叫我。", name: "关闭陪伴" },
    { re: /(开启|开始).*(陪伴)/, action: () => startCompanion(), reply: "好呀～主动陪伴已开启，我会一直看着你哦。", name: "开启陪伴" },
    { re: /网易云|网抑云/, action: () => clickApp("netease"), reply: "好的，帮你打开网易云～", name: "打开网易云" },
    { re: /抖音/, action: () => clickApp("douyin"), reply: "好嘞，抖音这就打开～", name: "打开抖音" },
    { re: /b站|哔哩哔哩|bilibili/i, action: () => clickApp("bilibili"), reply: "好的，帮你打开 B 站～", name: "打开B站" },
    { re: /摄像头.*(关闭|关掉|关上)|(关闭|关掉|关上).*摄像头/, action: () => camClickIf(true), reply: "摄像头关掉啦～", name: "关闭摄像头" },
    { re: /摄像头.*(打开|开启)|(打开|开启).*摄像头/, action: () => camClickIf(false), reply: "摄像头这就打开～", name: "打开摄像头" },
    { re: /小玲/, action: () => pushBubble("ling", "我在呢～想聊聊天，或者直接告诉我打开哪个平台？"), reply: "我在呢～", name: "呼叫小玲" },
  ];

  function clickApp(platform) {
    const el = document.querySelector(`.btn-app[data-platform="${platform}"]`);
    if (el) el.click();
  }

  function camClickIf(shouldClose) {
    if (!camBtn) return;
    const isOpen = camBtn.textContent === "关闭摄像头";
    // 关闭指令仅在已开启时点击；打开指令仅在未开启时点击
    if (shouldClose ? isOpen : !isOpen) camBtn.click();
  }

  let recognition = null;
  let listening = false;
  let restartTimer = null;
  let lastText = "";
  let lastAt = 0;

  function speak(text) {
    try {
      if (!("speechSynthesis" in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch (e) {
      /* 本机无中文语音库时静默，气泡已兜底 */
    }
  }

  function setUI(on) {
    listening = on;
    btn.classList.toggle("is-listening", on);
    btn.textContent = on ? "🎙️ 聆听中…" : "🎙️ 语音唤醒";
  }

  function start() {
    if (!supported || listening) return;
    try {
      recognition = new SR();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onresult = (e) => {
        const seg = e.results[e.results.length - 1];
        if (!seg || !seg[0]) return;
        handleCommand(seg[0].transcript.trim());
      };

      recognition.onerror = (e) => {
        if (e.error === "not-allowed") {
          stop();
          pushBubble("ling", "唔，麦克风权限被拒绝了，语音唤醒用不了啦。可以在浏览器地址栏左侧重新允许麦克风后，再点一次语音唤醒。");
        }
        // network / no-speech 等其他错误：交给 onend 自动续听
      };

      recognition.onend = () => {
        if (listening) {
          restartTimer = setTimeout(start, 800); // 长沉默断连后自动续听
        }
      };

      recognition.start();
      setUI(true);
    } catch (e) {
      pushBubble("ling", "语音启动失败了，请检查浏览器麦克风权限。");
    }
  }

  function stop() {
    listening = false;
    setUI(false);
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
      recognition = null;
    }
  }

  function handleCommand(text) {
    if (!text) return;
    const now = Date.now();
    // 同一句话 3 秒内去重，防止识别器重复推送造成误触发
    if (text === lastText && now - lastAt < 3000) return;
    lastText = text;
    lastAt = now;

    const normalized = text.replace(/\s+/g, "");
    const hits = COMMANDS.filter((c) => c.re.test(normalized));
    if (!hits.length) return;

    // 若同时命中"呼叫小玲"与具体指令，只执行具体指令
    const concrete = hits.filter((c) => c.name !== "呼叫小玲");
    const final = concrete.length ? concrete : hits.slice(0, 1);

    pushBubble("mine", `「${text}」`);
    final.forEach((cmd) => {
      try { cmd.action(); } catch (e) { /* 单条指令失败不阻断后续 */ }
      pushBubble("ling", cmd.reply);
      speak(cmd.reply);
    });
  }

  btn.addEventListener("click", () => {
    if (listening) {
      stop();
      return;
    }
    start();
    pushBubble("ling", "我在听哦～试着说一句“开启主动陪伴”，或者“打开网易云”。");
  });

  if (!supported) {
    btn.disabled = true;
    btn.title = "当前浏览器不支持语音唤醒，请使用 Chrome / Edge 浏览器";
    btn.textContent = "🎙️ 语音不可用";
  }
})();
