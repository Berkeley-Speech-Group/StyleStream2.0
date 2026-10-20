"use strict";

const SAMPLE_ROOT = "./static/samples";
const TASKS = {
  vsc: {
    anchor: "voice-style-conversion",
    description: "Transfer a target voice’s style while preserving the source words.",
    models: [
      ["cosyvoice2", "CosyVoice 2"],
      ["cosyvoice3", "CosyVoice 3"],
      ["final-vevo", "Vevo"],
      ["final-vevo2", "Vevo 2"],
      ["final-stylestream", "StyleStream 1.0", "Offline"],
      ["final-stylestream-streaming-s12", "StyleStream 1.0", "Streaming"],
      ["final-meanflow", "StyleStream 2.0", "Offline"],
      ["final-meanflow-streaming-cs4800-la1280", "StyleStream 2.0", "Streaming"]
    ]
  },
  design: {
    anchor: "voice-design",
    description: "Describe a target voice in natural language while preserving the source content.",
    promptField: "prompt",
    promptLabel: "Voice description",
    models: [
      ["captts", "CapTTS"],
      ["qwen3_voice_design", "Qwen3-TTS"],
      ["stylestream2.0-st64-w4.0", "StyleStream 2.0", "Offline"],
      ["streaming-st64-w4.0", "StyleStream 2.0", "Streaming"]
    ]
  },
  edit: {
    anchor: "voice-editing",
    description: "Edit one voice attribute with a text instruction, preserving the other attributes.",
    promptField: "instruction",
    promptLabel: "Edit instruction",
    models: [
      ["vevo", "Vevo"],
      ["vevo2", "Vevo 2"],
      ["stylestream2.0-st64-w4.0", "StyleStream 2.0", "Offline"],
      ["streaming-st64-w4.0", "StyleStream 2.0", "Streaming"]
    ]
  }
};

const states = Object.fromEntries(Object.keys(TASKS).map((task) => [task, {
  rows: [], selected: 0, loading: true, error: false
}]));
const tabs = [...document.querySelectorAll("[role='tab']")];
const panel = document.getElementById("demo-panel");
const sampleSelect = document.getElementById("sample-select");
const previousButton = document.getElementById("previous-sample");
const nextButton = document.getElementById("next-sample");
const sampleContent = document.getElementById("sample-content");
const playbackStatus = document.getElementById("playback-status");
let activeTask = taskFromHash() || "vsc";
let playingMedia = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function titleCase(value) {
  const text = String(value || "").replace(/_/g, " ");
  if (text.toLowerCase() === "us") return "US";
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function taskFromHash() {
  return Object.keys(TASKS).find((task) => `#${TASKS[task].anchor}` === window.location.hash);
}

function exampleLabel(row, index) {
  const text = activeTask === "vsc" ? titleCase(row.target) : row[TASKS[activeTask].promptField];
  return `Example ${String(index + 1).padStart(2, "0")} · ${text}`;
}

function audioPlayer(path, label) {
  const safePath = escapeHtml(path);
  return `<audio controls preload="none" aria-label="${escapeHtml(label)}" data-label="${escapeHtml(label)}">
    <source src="${safePath}" type="audio/wav">
    Your browser does not support audio playback. <a href="${safePath}">Download audio</a>.
  </audio>`;
}

function samplePaths(task, row) {
  if (task === "vsc") {
    const root = `${SAMPLE_ROOT}/vsc/${encodeURIComponent(row.task)}`;
    const sourceId = encodeURIComponent(row.source_id);
    const target = encodeURIComponent(row.target);
    return {
      source: `${root}/source/${sourceId}.wav`,
      target: `${root}/target/${target}.wav`,
      model: (model) => `${root}/${model}/${model}_${sourceId}_to_${target}.wav`
    };
  }
  const root = `${SAMPLE_ROOT}/${task}`;
  const id = encodeURIComponent(row.eval_id);
  return {
    source: `${root}/source/${id}.wav`,
    model: (model) => `${root}/${model}/${id}.wav`
  };
}

function renderExample(row, index) {
  const config = TASKS[activeTask];
  const paths = samplePaths(activeTask, row);
  const example = `example ${index + 1}`;
  const sourceText = row.source_text ? `<details class="transcript"><summary>Read source text</summary><p>${escapeHtml(row.source_text)}</p></details>` : "";
  const source = `<div class="input-card" data-media-card>
    <div class="input-heading"><span class="input-label">${activeTask === "design" ? "Source content" : "Source audio"}</span><span class="input-detail">Original</span></div>
    ${audioPlayer(paths.source, `Source audio, ${example}`)}${sourceText}
  </div>`;
  let target;
  if (activeTask === "vsc") {
    target = `<div class="input-card" data-media-card>
      <div class="input-heading"><span class="input-label">Target reference</span><span class="input-detail">${escapeHtml(titleCase(row.target))}</span></div>
      ${audioPlayer(paths.target, `Target reference: ${titleCase(row.target)}, ${example}`)}
    </div>`;
  } else {
    target = `<div class="input-card prompt-card">
      <div class="input-heading"><span class="input-label">${escapeHtml(config.promptLabel)}</span></div>
      <p class="prompt-text">“${escapeHtml(row[config.promptField])}”</p>
    </div>`;
  }
  const models = config.models.map(([id, name, mode]) => {
    const ours = name === "StyleStream 2.0";
    const label = `${name}${mode ? ` (${mode})` : ""}, ${example}${activeTask === "vsc" ? `, target ${titleCase(row.target)}` : ""}`;
    return `<article class="model-card${ours ? " is-ours" : ""}" data-media-card>
      <div class="model-heading"><h4>${escapeHtml(name)}</h4>${mode ? `<span class="model-mode${mode === "Streaming" ? " is-streaming" : ""}">${escapeHtml(mode)}</span>` : ""}</div>
      ${audioPlayer(paths.model(id), label)}
    </article>`;
  }).join("");
  return `<div class="input-grid">${source}${target}</div>
    <div class="comparison-heading"><h3>Model comparison</h3></div>
    <div class="model-grid">${models}</div>`;
}

function pauseSampleAudio() {
  sampleContent.querySelectorAll("audio").forEach((audio) => {
    audio.pause();
    if (playingMedia === audio) playingMedia = null;
  });
  playbackStatus.textContent = "";
}

function renderPanel() {
  pauseSampleAudio();
  const state = states[activeTask];
  const config = TASKS[activeTask];
  tabs.forEach((tab) => {
    const selected = tab.dataset.task === activeTask;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  panel.setAttribute("aria-labelledby", `${activeTask}-tab`);
  panel.setAttribute("aria-busy", String(state.loading));
  document.getElementById("task-description").textContent = config.description;
  const unavailable = state.loading || state.error;
  sampleSelect.disabled = unavailable;
  previousButton.disabled = unavailable || state.selected === 0;
  nextButton.disabled = unavailable || state.selected >= state.rows.length - 1;
  if (unavailable) {
    sampleSelect.innerHTML = `<option>${state.loading ? "Loading examples…" : "Examples unavailable"}</option>`;
    sampleContent.innerHTML = state.loading
      ? '<p class="loading-message" role="status">Loading audio examples…</p>'
      : '<div class="notice" role="alert"><p>The audio examples could not be loaded. Please try again.</p><button class="button button-secondary" type="button" data-action="retry">Retry loading examples</button></div>';
    return;
  }
  sampleSelect.replaceChildren(...state.rows.map((row, index) => new Option(exampleLabel(row, index), String(index))));
  sampleSelect.value = String(state.selected);
  sampleContent.innerHTML = renderExample(state.rows[state.selected], state.selected);
}

function activateTask(task, updateHash = true) {
  if (!TASKS[task]) return;
  activeTask = task;
  if (updateHash) history.replaceState(null, "", `#${TASKS[task].anchor}`);
  renderPanel();
}

function moveExample(direction) {
  const state = states[activeTask];
  const selected = state.selected + direction;
  if (state.loading || state.error || selected < 0 || selected >= state.rows.length) return;
  state.selected = selected;
  renderPanel();
}

async function loadTask(task) {
  const state = states[task];
  state.loading = true;
  state.error = false;
  if (task === activeTask) renderPanel();
  try {
    const response = await fetch(`${SAMPLE_ROOT}/${task}/manifest.jsonl`);
    if (!response.ok) throw new Error("Manifest unavailable");
    const text = await response.text();
    const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
    if (!rows.length) throw new Error("No examples available");
    state.rows = rows;
  } catch {
    state.error = true;
  } finally {
    state.loading = false;
    if (task === activeTask) renderPanel();
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTask(tab.dataset.task));
  tab.addEventListener("keydown", (event) => {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    activateTask(tabs[nextIndex].dataset.task);
    tabs[nextIndex].focus();
  });
});
sampleSelect.addEventListener("change", () => {
  states[activeTask].selected = Number(sampleSelect.value);
  renderPanel();
});
previousButton.addEventListener("click", () => moveExample(-1));
nextButton.addEventListener("click", () => moveExample(1));
sampleContent.addEventListener("click", (event) => {
  if (event.target.closest("[data-action='retry']")) loadTask(activeTask);
});
window.addEventListener("hashchange", () => {
  const task = taskFromHash();
  if (task) activateTask(task, false);
});

document.addEventListener("play", (event) => {
  const media = event.target;
  if (!(media instanceof HTMLMediaElement)) return;
  document.querySelectorAll("audio, video").forEach((other) => {
    if (other !== media) other.pause();
  });
  document.querySelectorAll(".is-playing").forEach((card) => card.classList.remove("is-playing"));
  playingMedia = media;
  media.closest("[data-media-card]")?.classList.add("is-playing");
  if (media instanceof HTMLAudioElement) playbackStatus.textContent = `Now playing · ${media.dataset.label}`;
  else playbackStatus.textContent = "Video demo is playing.";
}, true);

for (const eventName of ["pause", "ended"]) {
  document.addEventListener(eventName, (event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement)) return;
    media.closest("[data-media-card]")?.classList.remove("is-playing");
    if (playingMedia !== media) return;
    playingMedia = null;
    if (media instanceof HTMLAudioElement) playbackStatus.textContent = `${eventName === "ended" ? "Finished" : "Paused"} · ${media.dataset.label}`;
    else playbackStatus.textContent = "";
  }, true);
}

document.addEventListener("error", (event) => {
  if (!(event.target instanceof Element)) return;
  const audio = event.target.closest("audio");
  const card = audio?.closest("[data-media-card]");
  if (!card || card.querySelector(".media-error")) return;
  const message = document.createElement("p");
  message.className = "media-error";
  message.setAttribute("role", "status");
  message.textContent = "This audio could not be loaded. Please try another sample.";
  card.append(message);
}, true);

activateTask(activeTask, false);
Object.keys(TASKS).forEach(loadTask);
