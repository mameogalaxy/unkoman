/* タイムラプスカメラ
 * カメラ映像を一定間隔でキャプチャし、フレーム列としてためて
 * タイムラプス動画(WebM)として書き出すブラウザアプリ。
 * すべてクライアント側で完結する。
 */
(() => {
  "use strict";

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const preview = $("preview");
  const captureCanvas = $("capture");
  const playbackCanvas = $("playback");
  const overlayDot = $("recDot");
  const frameCounter = $("frameCounter");
  const emptyState = $("emptyState");
  const statusEl = $("status");

  const startCamBtn = $("startCam");
  const recordBtn = $("recordBtn");
  const playBtn = $("playBtn");
  const exportBtn = $("exportBtn");
  const clearBtn = $("clearBtn");

  const intervalValue = $("intervalValue");
  const intervalUnit = $("intervalUnit");
  const fpsInput = $("fps");
  const fpsLabel = $("fpsLabel");
  const cameraSelect = $("cameraSelect");
  const showTimestamp = $("showTimestamp");

  const sumFrames = $("sumFrames");
  const sumDuration = $("sumDuration");
  const sumElapsed = $("sumElapsed");

  // ---- 状態 ----
  let stream = null;
  let frames = []; // { bitmap: ImageBitmap, time: Date }
  let captureTimer = null;
  let recordStartTime = 0;
  let isRecording = false;
  let isPlaying = false;
  let playTimer = null;
  let frameW = 0;
  let frameH = 0;
  let wakeLock = null;

  // ---- 画面スリープ防止 (Wake Lock) ----
  // スマホでは撮影中に画面が消えると setInterval も止まり撮影が中断する。
  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      // 画面復帰時に自動解放されることがあるため再取得する
      wakeLock.addEventListener("release", () => {
        if (isRecording) acquireWakeLock();
      });
    } catch (e) {
      /* 取得失敗は致命的ではない */
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) await wakeLock.release();
    } catch (e) {
      /* ignore */
    }
    wakeLock = null;
  }

  // タブが再表示されたら（撮影中なら）Wake Lock を取り直す
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isRecording) {
      acquireWakeLock();
    }
  });

  // ---- ユーティリティ ----
  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function intervalMs() {
    const v = parseFloat(intervalValue.value) || 1;
    const unit = parseInt(intervalUnit.value, 10) || 1000;
    return Math.max(100, v * unit);
  }

  function fps() {
    return parseInt(fpsInput.value, 10) || 15;
  }

  function updateSummary() {
    const n = frames.length;
    sumFrames.textContent = n;
    sumDuration.textContent = (n / fps()).toFixed(1) + " 秒";
    if (recordStartTime && frames.length) {
      const elapsedSec = Math.round(
        (frames[frames.length - 1].time - frames[0].time) / 1000
      );
      sumElapsed.textContent = elapsedSec + " 秒";
    } else {
      sumElapsed.textContent = "0 秒";
    }
    frameCounter.textContent = n + " フレーム";
  }

  function drawTimestamp(ctx, w, h, date) {
    const text = date.toLocaleString("ja-JP");
    const fontSize = Math.max(14, Math.round(w * 0.02));
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "bottom";
    const padding = fontSize * 0.5;
    const metrics = ctx.measureText(text);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(
      padding / 2,
      h - fontSize - padding * 1.5,
      metrics.width + padding,
      fontSize + padding
    );
    ctx.fillStyle = "#fff";
    ctx.fillText(text, padding, h - padding);
  }

  // ---- カメラ ----
  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      cameraSelect.innerHTML = "";
      cams.forEach((cam, i) => {
        const opt = document.createElement("option");
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `カメラ ${i + 1}`;
        cameraSelect.appendChild(opt);
      });
      cameraSelect.disabled = cams.length === 0;
    } catch (e) {
      // 列挙に失敗しても致命的ではない
    }
  }

  async function startCamera(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("このブラウザはカメラに対応していません。", "error");
      return;
    }
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      preview.srcObject = stream;
      await preview.play();
      preview.hidden = false;
      playbackCanvas.hidden = true;
      emptyState.style.display = "none";

      const track = stream.getVideoTracks()[0];
      const s = track.getSettings();
      frameW = s.width || preview.videoWidth || 1280;
      frameH = s.height || preview.videoHeight || 720;

      await listCameras();
      recordBtn.disabled = false;
      cameraSelect.disabled = false;
      startCamBtn.textContent = "🔄 カメラを切替";
      setStatus("カメラ準備完了。撮影を開始できます。", "ok");
    } catch (e) {
      setStatus("カメラを起動できませんでした: " + e.message, "error");
    }
  }

  // ---- 撮影 ----
  async function captureFrame() {
    if (!stream || preview.videoWidth === 0) return;
    const w = preview.videoWidth;
    const h = preview.videoHeight;
    captureCanvas.width = w;
    captureCanvas.height = h;
    const ctx = captureCanvas.getContext("2d");
    ctx.drawImage(preview, 0, 0, w, h);

    const now = new Date();
    if (showTimestamp.checked) {
      drawTimestamp(ctx, w, h, now);
    }

    // ImageBitmap で保持（メモリ効率・描画が速い）
    const bitmap = await createImageBitmap(captureCanvas);
    frames.push({ bitmap, time: now });
    frameW = w;
    frameH = h;
    updateSummary();
    enableEditButtons();
  }

  function startRecording() {
    if (!stream) return;
    isRecording = true;
    recordStartTime = Date.now();
    overlayDot.hidden = false;
    recordBtn.textContent = "■ 撮影停止";
    recordBtn.classList.add("recording");
    playBtn.disabled = true;
    exportBtn.disabled = true;
    setStatus(`${(intervalMs() / 1000).toFixed(1)} 秒ごとに撮影中…`);

    acquireWakeLock(); // 撮影中は画面を消さない（スマホ対策）
    captureFrame(); // 最初の1枚をすぐ撮る
    captureTimer = setInterval(captureFrame, intervalMs());
  }

  function stopRecording() {
    isRecording = false;
    clearInterval(captureTimer);
    captureTimer = null;
    overlayDot.hidden = true;
    recordBtn.textContent = "● 撮影再開";
    recordBtn.classList.remove("recording");
    releaseWakeLock();
    enableEditButtons();
    setStatus(`撮影を停止しました（${frames.length} フレーム）。`, "ok");
  }

  function enableEditButtons() {
    const has = frames.length > 0;
    playBtn.disabled = !has || isRecording;
    exportBtn.disabled = !has || isRecording;
    clearBtn.disabled = !has || isRecording;
  }

  // ---- プレビュー再生 ----
  function showPlaybackCanvas() {
    playbackCanvas.width = frameW;
    playbackCanvas.height = frameH;
    preview.hidden = true;
    playbackCanvas.hidden = false;
  }

  function showLivePreview() {
    playbackCanvas.hidden = true;
    preview.hidden = false;
  }

  function playPreview() {
    if (frames.length === 0) return;
    if (isPlaying) {
      stopPreview();
      return;
    }
    isPlaying = true;
    playBtn.textContent = "⏹ 停止";
    showPlaybackCanvas();
    const ctx = playbackCanvas.getContext("2d");
    let i = 0;
    const intervalPerFrame = 1000 / fps();
    playTimer = setInterval(() => {
      if (i >= frames.length) {
        stopPreview();
        return;
      }
      ctx.drawImage(frames[i].bitmap, 0, 0, frameW, frameH);
      frameCounter.textContent = `${i + 1} / ${frames.length}`;
      i++;
    }, intervalPerFrame);
  }

  function stopPreview() {
    isPlaying = false;
    clearInterval(playTimer);
    playTimer = null;
    playBtn.textContent = "▶ プレビュー再生";
    showLivePreview();
    updateSummary();
  }

  // ---- 書き出し ----
  async function exportVideo() {
    if (frames.length === 0) return;
    if (!window.MediaRecorder) {
      setStatus("このブラウザは動画書き出しに対応していません。", "error");
      return;
    }

    exportBtn.disabled = true;
    setStatus("動画を生成中…");

    const out = document.createElement("canvas");
    out.width = frameW;
    out.height = frameH;
    const ctx = out.getContext("2d");

    const targetFps = fps();
    const canvasStream = out.captureStream(targetFps);

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });
    } catch (e) {
      setStatus("録画機能の初期化に失敗しました: " + e.message, "error");
      exportBtn.disabled = false;
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();

    const msPerFrame = 1000 / targetFps;
    for (let i = 0; i < frames.length; i++) {
      ctx.drawImage(frames[i].bitmap, 0, 0, frameW, frameH);
      // captureStream がフレームを拾えるよう実時間で待つ
      await sleep(msPerFrame);
      setStatus(`動画を生成中… ${i + 1} / ${frames.length}`);
    }
    // 最後のフレームを確実に含める
    await sleep(msPerFrame * 2);
    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `timelapse-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    exportBtn.disabled = false;
    setStatus("動画を書き出しました。ダウンロードを確認してください。", "ok");
  }

  function pickMimeType() {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "video/webm";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---- クリア ----
  function clearFrames() {
    if (frames.length && !confirm("撮影したフレームをすべて削除しますか？")) return;
    frames.forEach((f) => f.bitmap.close && f.bitmap.close());
    frames = [];
    recordStartTime = 0;
    updateSummary();
    enableEditButtons();
    setStatus("フレームをクリアしました。");
  }

  // ---- イベント ----
  startCamBtn.addEventListener("click", () =>
    startCamera(cameraSelect.value || null)
  );
  cameraSelect.addEventListener("change", () => {
    if (stream) startCamera(cameraSelect.value);
  });
  recordBtn.addEventListener("click", () => {
    if (isRecording) stopRecording();
    else startRecording();
  });
  playBtn.addEventListener("click", playPreview);
  exportBtn.addEventListener("click", exportVideo);
  clearBtn.addEventListener("click", clearFrames);

  fpsInput.addEventListener("input", () => {
    fpsLabel.textContent = fps();
    updateSummary();
  });

  // 初期化
  updateSummary();
  if (location.protocol === "file:") {
    setStatus(
      "ヒント: カメラは https かローカルサーバー経由で開くと許可されます。",
      ""
    );
  }
})();
