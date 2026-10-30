const STORAGE = {
  accessCode: "mwalimu.accessCode",
  mode: "mwalimu.mode",
  model: "mwalimu.model",
};

const MODES = new Set(["conversation", "lesson", "quick"]);
const MODELS = new Set(["gpt-realtime-2.1", "gpt-realtime-2.1-mini"]);

const elements = {
  callControls: document.querySelector("#callControls"),
  changeCodeButton: document.querySelector("#changeCodeButton"),
  clearTranscriptButton: document.querySelector("#clearTranscriptButton"),
  endButton: document.querySelector("#endButton"),
  installButton: document.querySelector("#installButton"),
  installDialog: document.querySelector("#installDialog"),
  modelPill: document.querySelector("#modelPill"),
  muteButton: document.querySelector("#muteButton"),
  pairingDialog: document.querySelector("#pairingDialog"),
  pairingError: document.querySelector("#pairingError"),
  pairingForm: document.querySelector("#pairingForm"),
  pairingInput: document.querySelector("#pairingInput"),
  pairingStatus: document.querySelector("#pairingStatus"),
  remoteAudio: document.querySelector("#remoteAudio"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  startButton: document.querySelector("#startButton"),
  statusDetail: document.querySelector("#statusDetail"),
  statusKicker: document.querySelector("#statusKicker"),
  statusTitle: document.querySelector("#statusTitle"),
  textForm: document.querySelector("#textForm"),
  textInput: document.querySelector("#textInput"),
  toast: document.querySelector("#toast"),
  transcript: document.querySelector("#transcript"),
  transcriptCard: document.querySelector("#transcriptCard"),
  voiceOrb: document.querySelector("#voiceOrb"),
};

let peerConnection = null;
let dataChannel = null;
let microphoneStream = null;
let currentMode = readChoice(STORAGE.mode, MODES, "conversation");
let currentModel = readChoice(STORAGE.model, MODELS, "gpt-realtime-2.1");
let accessCode = localStorage.getItem(STORAGE.accessCode) || "";
let muted = false;
let toastTimer = null;
let assistantDraft = "";
const transcriptItems = new Map();

function readChoice(key, allowed, fallback) {
  const value = localStorage.getItem(key);
  return allowed.has(value) ? value : fallback;
}

function capturePairingCodeFromLink() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const code = hash.get("code")?.trim();
  if (!code) return;
  accessCode = code;
  localStorage.setItem(STORAGE.accessCode, code);
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function setStatus(state, kicker, title, detail) {
  elements.voiceOrb.className = `voice-orb${state ? ` is-${state}` : ""}`;
  elements.statusKicker.textContent = kicker;
  elements.statusTitle.textContent = title;
  elements.statusDetail.textContent = detail;
}

function setSessionUi(active) {
  elements.startButton.hidden = active;
  elements.callControls.hidden = !active;
  elements.transcriptCard.hidden = !active && transcriptItems.size === 0;
  document.querySelectorAll(".mode-card").forEach((button) => {
    button.disabled = active;
  });
}

function selectMode(mode) {
  if (!MODES.has(mode) || peerConnection) return;
  currentMode = mode;
  localStorage.setItem(STORAGE.mode, mode);
  document.querySelectorAll(".mode-card").forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function selectModel(model) {
  if (!MODELS.has(model)) return;
  currentModel = model;
  localStorage.setItem(STORAGE.model, model);
  elements.modelPill.textContent =
    model === "gpt-realtime-2.1-mini" ? "Realtime 2.1 mini" : "Realtime 2.1";
  document.querySelectorAll('input[name="model"]').forEach((input) => {
    input.checked = input.value === model;
  });
}

function openPairingDialog(message = "") {
  elements.pairingError.textContent = message;
  elements.pairingError.hidden = !message;
  elements.pairingInput.value = "";
  if (!elements.pairingDialog.open) elements.pairingDialog.showModal();
  setTimeout(() => elements.pairingInput.focus(), 80);
}

function addOrUpdateTranscript(role, id, text, pending = false) {
  if (!text?.trim()) return;
  let bubble = transcriptItems.get(id);
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.className = `bubble ${role}`;
    bubble.dataset.itemId = id;
    transcriptItems.set(id, bubble);
    elements.transcript.append(bubble);
  }
  bubble.textContent = text.trim();
  bubble.classList.toggle("pending", pending);
  elements.transcriptCard.hidden = false;
  elements.transcript.scrollTop = elements.transcript.scrollHeight;
}

function extractAssistantText(response) {
  const pieces = [];
  for (const output of response?.output || []) {
    for (const content of output?.content || []) {
      if (content.transcript) pieces.push(content.transcript);
      else if (content.text) pieces.push(content.text);
    }
  }
  return pieces.join(" ").trim();
}

function handleServerEvent(event) {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      setStatus("listening", "Tuko live", "Ninakusikiliza", "Speak in English, Swahili, or both.");
      break;
    case "input_audio_buffer.speech_started":
      setStatus("listening", "Nasikia", "Endelea…", "Mwalimu is listening.");
      break;
    case "input_audio_buffer.speech_stopped":
      setStatus("connecting", "Ngoja kidogo", "Nafikiria…", "Putting your Swahili together.");
      break;
    case "conversation.item.input_audio_transcription.delta": {
      const id = `user-${event.item_id || "current"}`;
      const existing = transcriptItems.get(id)?.textContent || "";
      addOrUpdateTranscript("user", id, `${existing}${event.delta || ""}`, true);
      break;
    }
    case "conversation.item.input_audio_transcription.completed":
      addOrUpdateTranscript("user", `user-${event.item_id}`, event.transcript, false);
      break;
    case "response.created":
      assistantDraft = "";
      setStatus("connecting", "Nafikiria", "Sekunde moja…", "Preparing a helpful answer.");
      break;
    case "response.output_audio_transcript.delta": {
      assistantDraft += event.delta || "";
      const id = `assistant-${event.response_id || "current"}`;
      addOrUpdateTranscript("assistant", id, assistantDraft, true);
      setStatus("speaking", "Mwalimu", "Ninakujibu", "You can interrupt naturally at any time.");
      break;
    }
    case "response.output_audio_transcript.done": {
      const id = `assistant-${event.response_id || "current"}`;
      addOrUpdateTranscript("assistant", id, event.transcript || assistantDraft, false);
      break;
    }
    case "output_audio_buffer.started":
      setStatus("speaking", "Mwalimu", "Ninakujibu", "You can interrupt naturally at any time.");
      break;
    case "output_audio_buffer.stopped":
      setStatus("listening", "Zamu yako", "Ninakusikiliza", "Reply when you're ready.");
      break;
    case "response.done": {
      const text = extractAssistantText(event.response);
      if (text) addOrUpdateTranscript("assistant", `assistant-${event.response?.id || Date.now()}`, text, false);
      setStatus("listening", "Zamu yako", "Ninakusikiliza", "Reply when you're ready.");
      break;
    }
    case "error":
      console.error("Realtime API error", event);
      showToast(event.error?.message || "The voice session hit a temporary problem.");
      break;
    default:
      break;
  }
}

function sendEvent(event) {
  if (!dataChannel || dataChannel.readyState !== "open") return false;
  dataChannel.send(JSON.stringify(event));
  return true;
}

function greet() {
  const instructions = {
    conversation: "Greet the learner casually in Kenyan Swahili and ask one easy, natural question to begin today's conversation.",
    lesson: "Start today's guided lesson. Briefly say what useful topic you chose and teach the first example before asking one practice question.",
    quick: "Open with exactly: Sema, nikusaidie na nini? Keep it short.",
  };
  sendEvent({
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      instructions: instructions[currentMode],
    },
  });
}

async function startSession() {
  if (peerConnection) return;
  if (!accessCode) {
    openPairingDialog();
    return;
  }

  elements.startButton.disabled = true;
  setStatus("connecting", "Inaunganisha", "Getting Mwalimu ready…", "The first connection can take a few seconds.");

  try {
    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel("oai-events");
    peerConnection = pc;
    dataChannel = dc;

    dc.addEventListener("open", () => {
      setSessionUi(true);
      greet();
    });
    dc.addEventListener("message", (message) => {
      try {
        handleServerEvent(JSON.parse(message.data));
      } catch (error) {
        console.error("Could not read Realtime event", error);
      }
    });
    dc.addEventListener("close", () => {
      if (peerConnection) endSession(false);
    });

    pc.addEventListener("track", async (event) => {
      elements.remoteAudio.srcObject = event.streams[0];
      try {
        await elements.remoteAudio.play();
      } catch {
        showToast("Tap the screen once if iPhone audio does not begin.");
      }
    });

    pc.addEventListener("connectionstatechange", () => {
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        showToast("The voice connection ended. Tap to reconnect.");
        endSession(false);
      }
    });

    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    pc.addTrack(microphoneStream.getAudioTracks()[0], microphoneStream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const response = await fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        "X-Mwalimu-Code": accessCode,
        "X-Mwalimu-Mode": currentMode,
        "X-Mwalimu-Model": currentModel,
      },
      body: offer.sdp,
    });

    if (response.status === 401) {
      localStorage.removeItem(STORAGE.accessCode);
      accessCode = "";
      throw new Error("PAIRING_REQUIRED");
    }

    if (!response.ok) {
      let message = "Mwalimu could not start a voice session.";
      try {
        const body = await response.json();
        message = body.error || message;
      } catch {
        // Use the friendly fallback.
      }
      throw new Error(message);
    }

    await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
  } catch (error) {
    console.error(error);
    endSession(false);
    if (error.message === "PAIRING_REQUIRED") {
      openPairingDialog("That code did not match. Please use your private pairing link or enter the code again.");
    } else if (error.name === "NotAllowedError") {
      showToast("Microphone access is required. Allow it in Safari settings, then try again.");
    } else {
      showToast(error.message || "Could not start the voice session.");
    }
  } finally {
    elements.startButton.disabled = false;
  }
}

function endSession(showMessage = true) {
  dataChannel?.close();
  peerConnection?.close();
  microphoneStream?.getTracks().forEach((track) => track.stop());
  elements.remoteAudio.srcObject = null;
  peerConnection = null;
  dataChannel = null;
  microphoneStream = null;
  muted = false;
  elements.muteButton.classList.remove("is-muted");
  elements.muteButton.querySelector("span").textContent = "Mute";
  setSessionUi(false);
  setStatus("", "Tayari", "Ready when you are", "Tap below and start speaking naturally.");
  if (showMessage) showToast("Session ended. Tutaonana!");
}

function toggleMute() {
  const track = microphoneStream?.getAudioTracks()[0];
  if (!track) return;
  muted = !muted;
  track.enabled = !muted;
  elements.muteButton.classList.toggle("is-muted", muted);
  elements.muteButton.querySelector("span").textContent = muted ? "Unmute" : "Mute";
  showToast(muted ? "Microphone muted." : "Microphone is live again.");
}

function sendTypedMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const id = `typed-${Date.now()}`;
  addOrUpdateTranscript("user", id, trimmed, false);
  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: trimmed }],
    },
  });
  sendEvent({ type: "response.create", response: { output_modalities: ["audio"] } });
}

function clearTranscript() {
  transcriptItems.clear();
  elements.transcript.replaceChildren();
  if (!peerConnection) elements.transcriptCard.hidden = true;
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Offline shell unavailable", error);
    });
  }
}

document.querySelectorAll(".mode-card").forEach((button) => {
  button.addEventListener("click", () => selectMode(button.dataset.mode));
});

document.querySelectorAll('input[name="model"]').forEach((input) => {
  input.addEventListener("change", () => selectModel(input.value));
});

elements.startButton.addEventListener("click", startSession);
elements.endButton.addEventListener("click", () => endSession(true));
elements.muteButton.addEventListener("click", toggleMute);
elements.clearTranscriptButton.addEventListener("click", clearTranscript);
elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());
elements.installButton.addEventListener("click", () => elements.installDialog.showModal());
elements.changeCodeButton.addEventListener("click", () => {
  elements.settingsDialog.close();
  openPairingDialog();
});

elements.pairingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = elements.pairingInput.value.trim();
  if (!code) return;
  accessCode = code;
  localStorage.setItem(STORAGE.accessCode, code);
  elements.pairingStatus.textContent = "Paired to this phone";
  elements.pairingDialog.close();
  showToast("Phone paired. Karibu!");
});

elements.textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!peerConnection) {
    showToast("Start a voice session before sending a typed message.");
    return;
  }
  sendTypedMessage(elements.textInput.value);
  elements.textInput.value = "";
});

window.addEventListener("pagehide", () => {
  if (peerConnection) endSession(false);
});

capturePairingCodeFromLink();
selectMode(currentMode);
selectModel(currentModel);
elements.pairingStatus.textContent = accessCode ? "Paired to this phone" : "Not paired yet";
elements.installButton.hidden = isStandalone();
registerServiceWorker();
