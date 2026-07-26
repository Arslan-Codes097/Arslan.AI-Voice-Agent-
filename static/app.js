// ---------- Tunables for live call silence detection ----------
const SPEECH_VOLUME_THRESHOLD = 0.02;   // RMS level above which we consider the user "speaking"
const SILENCE_DURATION_MS = 1200;       // how long the user must go quiet before we end their turn
const MAX_TURN_DURATION_MS = 20000;     // safety cap so a stuck mic can't record forever

// ---------- App state ----------
let conversationHistory = [];   // [{role: 'user'|'assistant', content: string}]
let voiceReplyEnabled = false;
let liveCallActive = false;

let mediaRecorder = null;
let recordedChunks = [];
let recordingCancelled = false;
let isRecordingSingleMessage = false;

// Shared mic stream + analyser reused across live call turns
let micStream = null;
let audioContext = null;
let analyserNode = null;

// ---------- DOM references ----------
const emptyState = document.getElementById("emptyState");
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const liveCallBtn = document.getElementById("liveCallBtn");
const newChatBtn = document.getElementById("newChatBtn");
const modelSelect = document.getElementById("modelSelect");
const voiceReplyToggle = document.getElementById("voiceReplyToggle");
const statusBar = document.getElementById("statusBar");
const ttsPlayer = document.getElementById("ttsPlayer");

// ---------- Rendering helpers ----------

function addMessage(role, text) {
  emptyState.style.display = "none";
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  return bubble;
}

function setStatus(text) {
  statusBar.textContent = text;
}

// ---------- Core pipeline: user text -> LLM reply -> optional speech ----------
// Shared by the typed-chat flow, the single voice-message flow, and every
// turn of a live call. `speakReply` forces TTS playback for live call turns
// even if the sidebar toggle is off, since a silent "call" defeats the point.

let currentTypingController = null;

function stopSpeaking() {
  ttsPlayer.pause();
  ttsPlayer.currentTime = 0;
  if (currentTypingController) {
    currentTypingController.abort();
    currentTypingController = null;
  }
}

async function typeOutText(element, text, speed) {
  if (currentTypingController) {
    currentTypingController.abort();
  }
  const controller = new AbortController();
  currentTypingController = controller;

  element.textContent = "";
  for (let i = 0; i < text.length; i++) {
    if (controller.signal.aborted) {
       element.textContent = text;
       break;
    }
    element.textContent += text.charAt(i);
    await new Promise(r => setTimeout(r, speed));
  }
  if (currentTypingController === controller) {
    currentTypingController = null;
  }
}

async function getAssistantReply(userText, speakReply) {
  conversationHistory.push({ role: "user", content: userText });

  const pendingBubble = addMessage("assistant", "Thinking...");
  pendingBubble.classList.add("pending");

  let replyText;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        model: modelSelect.value,
        history: conversationHistory.slice(0, -1),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    replyText = data.reply;
  } catch (error) {
    replyText = "Sorry, I couldn't reach the model just now.";
    console.error(error);
  }

  pendingBubble.classList.remove("pending");
  conversationHistory.push({ role: "assistant", content: replyText });

  if (speakReply && replyText) {
    setStatus("Speaking...");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText }),
      });
      if (!response.ok) throw new Error(await response.text());
      const audioBlob = await response.blob();
      ttsPlayer.src = URL.createObjectURL(audioBlob);

      const ttsPromise = new Promise((resolve) => {
        ttsPlayer.onended = resolve;
        ttsPlayer.play().catch(e => {
          console.error("Audio playback error:", e);
          resolve();
        });
      });
      
      await Promise.all([
        typeOutText(pendingBubble, replyText, 45),
        ttsPromise
      ]);
    } catch (error) {
      console.error("TTS playback failed:", error);
      await typeOutText(pendingBubble, replyText, 15);
    }
    setStatus("");
  } else {
    await typeOutText(pendingBubble, replyText, 15);
  }
}

// ---------- Typed text flow ----------

async function sendTypedMessage() {
  const text = textInput.value.trim();
  if (!text) return;

  textInput.value = "";
  addMessage("user", text);
  await getAssistantReply(text, voiceReplyEnabled);
}

// ---------- Single voice message flow ----------
// micBtn starts/cancels a recording. sendBtn (the same button used for
// typed text) finalizes and sends it once the mic is active.

async function startSingleRecording() {
  stopSpeaking();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    recordingCancelled = false;
    isRecordingSingleMessage = true;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      isRecordingSingleMessage = false;
      micBtn.classList.remove("recording");

      if (recordingCancelled || recordedChunks.length === 0) return;

      const audioBlob = new Blob(recordedChunks, { type: "audio/webm" });
      await transcribeAndRespond(audioBlob);
    };

    mediaRecorder.start();
    micBtn.classList.add("recording");
    setStatus("Recording... tap the mic again to cancel, or Send to submit.");
  } catch (error) {
    console.error("Microphone access failed:", error);
    setStatus("Microphone access was denied.");
  }
}

function cancelSingleRecording() {
  recordingCancelled = true;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  setStatus("Recording cancelled.");
}

function finalizeSingleRecording() {
  setStatus("Processing your voice message...");
  mediaRecorder.stop(); // triggers onstop above, which uploads and responds
}

async function transcribeAndRespond(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "message.webm");

  let transcript;
  try {
    const response = await fetch("/api/transcribe", { method: "POST", body: formData });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    transcript = data.text.trim();
  } catch (error) {
    console.error("Transcription failed:", error);
    setStatus("Could not transcribe that recording.");
    return;
  }

  setStatus("");
  if (!transcript) {
    setStatus("Didn't catch any speech in that recording.");
    return;
  }

  addMessage("user", transcript);
  await getAssistantReply(transcript, voiceReplyEnabled);
}

// ---------- Live call mode ----------
// Continuous loop: listen until the user goes quiet, transcribe, reply,
// speak the reply, then start listening again. No interruption support:
// the mic stays off while Arslan.AI is speaking, by design.

async function startLiveCall() {
  stopSpeaking();
  liveCallActive = true;
  liveCallBtn.classList.add("active");
  liveCallBtn.title = "End live call";
  micBtn.disabled = true;
  sendBtn.disabled = true;
  textInput.disabled = true;

  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(micStream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 512;
  source.connect(analyserNode);

  runLiveCallTurn();
}

function stopLiveCall() {
  stopSpeaking();
  liveCallActive = false;
  liveCallBtn.classList.remove("active");
  liveCallBtn.title = "Start live call";
  micBtn.disabled = false;
  sendBtn.disabled = false;
  textInput.disabled = false;
  setStatus("");

  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
  if (audioContext) audioContext.close();
  micStream = null;
  audioContext = null;
  analyserNode = null;
}

function getCurrentVolume() {
  const buffer = new Uint8Array(analyserNode.fftSize);
  analyserNode.getByteTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const normalized = (buffer[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / buffer.length);
}

function runLiveCallTurn() {
  if (!liveCallActive) return;

  setStatus("Listening...");
  const chunks = [];
  const recorder = new MediaRecorder(micStream);
  mediaRecorder = recorder;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let hasSpoken = false;
  let silenceStartedAt = null;
  const turnStartedAt = Date.now();

  const checkInterval = setInterval(() => {
    if (!liveCallActive || recorder.state === "inactive") {
      clearInterval(checkInterval);
      return;
    }

    const volume = getCurrentVolume();
    const elapsed = Date.now() - turnStartedAt;

    if (volume > SPEECH_VOLUME_THRESHOLD) {
      hasSpoken = true;
      silenceStartedAt = null;
    } else if (hasSpoken) {
      if (silenceStartedAt === null) silenceStartedAt = Date.now();
      if (Date.now() - silenceStartedAt > SILENCE_DURATION_MS) {
        clearInterval(checkInterval);
        recorder.stop();
      }
    }

    if (elapsed > MAX_TURN_DURATION_MS) {
      clearInterval(checkInterval);
      recorder.stop();
    }
  }, 100);

  recorder.onstop = async () => {
    if (!liveCallActive) return;

    if (!hasSpoken || chunks.length === 0) {
      // Nobody said anything this turn; just listen again.
      runLiveCallTurn();
      return;
    }

    setStatus("Transcribing...");
    const audioBlob = new Blob(chunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob, "turn.webm");

    let transcript = "";
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!response.ok) throw new Error(await response.text());
      transcript = (await response.json()).text.trim();
    } catch (error) {
      console.error("Live call transcription failed:", error);
    }

    if (!liveCallActive) return;

    if (!transcript) {
      runLiveCallTurn();
      return;
    }

    addMessage("user", transcript);
    await getAssistantReply(transcript, true); // always speak during a live call

    if (liveCallActive) runLiveCallTurn();
  };

  recorder.start();
}

// ---------- Event wiring ----------

sendBtn.addEventListener("click", () => {
  if (isRecordingSingleMessage) {
    finalizeSingleRecording();
  } else {
    sendTypedMessage();
  }
});

textInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !isRecordingSingleMessage) {
    sendTypedMessage();
  }
});

micBtn.addEventListener("click", () => {
  if (liveCallActive) return;
  if (isRecordingSingleMessage) {
    cancelSingleRecording();
  } else {
    startSingleRecording();
  }
});

liveCallBtn.addEventListener("click", () => {
  if (liveCallActive) {
    stopLiveCall();
  } else {
    startLiveCall();
  }
});

newChatBtn.addEventListener("click", () => {
  stopSpeaking();
  conversationHistory = [];
  messagesEl.innerHTML = "";
  emptyState.style.display = "block";
  setStatus("");
});

voiceReplyToggle.addEventListener("click", () => {
  voiceReplyEnabled = !voiceReplyEnabled;
  voiceReplyToggle.dataset.enabled = String(voiceReplyEnabled);
  voiceReplyToggle.textContent = voiceReplyEnabled ? "Disable" : "Enable";
});
