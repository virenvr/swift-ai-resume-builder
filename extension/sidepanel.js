const api = globalThis.browser ?? chrome;

const APP_URL = "http://localhost:3000/";
const APP_ORIGIN = new URL(APP_URL).origin;
const LOGIN_URL = new URL("api/llm-login", APP_URL).href;
const GOOGLE_URL = new URL("api/google-login", APP_URL).href;
const UPLOAD_URL = new URL("api/resume/upload", APP_URL).href;
const NEW_RESUME = "";
const GOOGLE_POLL_MS = 2_000;
const GOOGLE_POLL_LIMIT_MS = 5 * 60_000;

const PROVIDERS = {
  gemini: { name: "Gemini", keyUrl: "https://aistudio.google.com/apikey" },
  anthropic: { name: "Claude", keyUrl: "https://platform.claude.com/settings/keys" },
  openai: { name: "ChatGPT", keyUrl: "https://platform.openai.com/api-keys" },
  "openai-compatible": { name: "custom AI" },
};

// How much to trust where the text came from. Higher wins across frames.
const RANK_PAGE = 1;
const RANK_POSTING = 2;
const RANK_SELECTION = 3;

const MIN_JD_LENGTH = 40;
const MAX_UNVERIFIED_PAGE_LENGTH = 40_000;
const JOB_WORDS =
  /responsibilit|qualification|requirements|what you('|’)ll|about the (role|job|position)|experience (with|in)|years of experience/i;

const frame = document.getElementById("app");
const create = document.getElementById("create");
const grab = document.getElementById("grab");
const notice = document.getElementById("notice");
const offline = document.getElementById("offline");
const aiButton = document.getElementById("ai");
const loginForm = document.getElementById("login");
const loginStatus = document.getElementById("login-status");
const providerInput = document.getElementById("provider");
const baseUrlField = document.getElementById("base-url-field");
const baseUrlInput = document.getElementById("base-url");
const apiKeyInput = document.getElementById("api-key");
const keyLink = document.getElementById("key-link");
const modelInput = document.getElementById("model");
const loginSubmit = document.getElementById("login-submit");
const logout = document.getElementById("logout");
const sheetButton = document.getElementById("sheet");
const googlePanel = document.getElementById("google");
const googleStatus = document.getElementById("google-status");
const sheetLink = document.getElementById("sheet-link");
const sheetForm = document.getElementById("sheet-form");
const sheetUrlInput = document.getElementById("sheet-url");
const sheetSubmit = document.getElementById("sheet-submit");
const googleConnect = document.getElementById("google-connect");
const googleSync = document.getElementById("google-sync");
const googleLogout = document.getElementById("google-logout");
const resumesButton = document.getElementById("resumes");
const uploadForm = document.getElementById("upload");
const uploadStatus = document.getElementById("upload-status");
const uploadTarget = document.getElementById("upload-target");
const uploadNameField = document.getElementById("upload-name-field");
const uploadName = document.getElementById("upload-name");
const uploadFile = document.getElementById("upload-file");
const uploadSubmit = document.getElementById("upload-submit");

// True while the Workbench is mounted in the frame and listening for a JD.
let workbenchReady = false;
let pendingJd = null;
let isOffline = false;
let isReading = false;
let appBusy = false;
let isLoggingIn = false;
let googlePoll = null;
let isUploading = false;
let pendingUpload = null;

function syncButtons() {
  const disabled = isOffline || isReading || appBusy || isLoggingIn || isUploading;
  create.disabled = disabled;
  grab.disabled = disabled;
  aiButton.disabled = isOffline;
  sheetButton.disabled = isOffline;
  resumesButton.disabled = isOffline;
  // A running cascade reads the template and master this would replace.
  uploadSubmit.disabled = disabled;
  // Switching provider mid-run would mix models across the cascade's steps.
  loginSubmit.disabled = disabled;
  logout.disabled = disabled;
}

function showNotice(text, pdfUrl = null) {
  notice.textContent = text ?? "";
  if (pdfUrl) {
    const link = document.createElement("a");
    link.href = new URL(pdfUrl, APP_URL).href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open PDF";
    notice.append(" ", link);
  }
  notice.hidden = !text;
}

async function connect() {
  try {
    // no-cors: this only checks that the server answers, and works without host access.
    await fetch(APP_URL, { method: "HEAD", mode: "no-cors" });
    isOffline = false;
    offline.hidden = true;
    frame.hidden = false;
    if (!frame.getAttribute("src")) frame.src = APP_URL;
    refreshLogin();
    refreshGoogle();
  } catch {
    isOffline = true;
    offline.hidden = false;
    frame.hidden = true;
  }
  syncButtons();
}

function syncProviderFields() {
  const custom = providerInput.value === "openai-compatible";
  const { keyUrl } = PROVIDERS[providerInput.value];
  baseUrlField.hidden = !custom;
  apiKeyInput.placeholder = custom ? "Leave blank if your server needs none" : "";
  modelInput.placeholder = custom ? "Required" : "Leave blank for the default";
  keyLink.hidden = !keyUrl;
  if (keyUrl) keyLink.href = keyUrl;
}

function showLoginState({ login, demoMode }) {
  aiButton.textContent = login ? `AI: ${PROVIDERS[login.provider].name}` : "AI login";
  logout.hidden = !login;
  if (login) {
    loginStatus.textContent = `Logged in to ${PROVIDERS[login.provider].name} (${login.model}).`;
    providerInput.value = login.provider;
    syncProviderFields();
  } else {
    loginStatus.textContent = demoMode
      ? "Not logged in. Taylor is using demo data, not real AI."
      : "Not logged in. Taylor is using the settings in .env.local.";
  }
}

async function callLogin(method, body) {
  const res = await fetch(LOGIN_URL, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

async function refreshLogin() {
  try {
    showLoginState(await callLogin("GET"));
  } catch (error) {
    loginStatus.textContent = `Couldn't check your login: ${error.message}`;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  isLoggingIn = true;
  syncButtons();
  loginStatus.textContent = "Checking your key with the provider…";
  try {
    const state = await callLogin("POST", {
      provider: providerInput.value,
      apiKey: apiKeyInput.value,
      baseURL: baseUrlInput.value,
      model: modelInput.value,
    });
    apiKeyInput.value = "";
    showLoginState(state);
  } catch (error) {
    loginStatus.textContent = `Login failed: ${error.message}`;
  } finally {
    isLoggingIn = false;
    syncButtons();
  }
}

async function logOut() {
  try {
    showLoginState(await callLogin("DELETE"));
    modelInput.value = "";
    baseUrlInput.value = "";
  } catch (error) {
    loginStatus.textContent = `Couldn't log out: ${error.message}`;
  }
}

function showGoogleState({ connected, email, sheetUrl, lastError, lastSyncedAt }) {
  sheetButton.textContent = connected && sheetUrl ? "Sheet: on" : "Google Sheet";
  googleConnect.hidden = connected;
  sheetForm.hidden = !connected;
  googleSync.hidden = !connected || !sheetUrl;
  googleLogout.hidden = !connected;
  sheetLink.hidden = !sheetUrl;
  if (sheetUrl) sheetLink.href = sheetUrl;
  sheetSubmit.textContent = sheetUrl ? "Switch to this sheet" : "Use this sheet";

  const synced = lastSyncedAt ? ` Last synced ${new Date(lastSyncedAt).toLocaleString()}.` : "";
  let state = "Log in to keep a Google Sheet of every application you save.";
  if (connected) {
    state = sheetUrl
      ? `Logged in as ${email}. Every application you save is added to your sheet.${synced}`
      : `Logged in as ${email}. Paste the link to the Google Sheet to track applications in.`;
  }
  googleStatus.textContent = lastError ? `${state} Last sync failed: ${lastError}` : state;
}

async function callGoogle(method, body) {
  const res = await fetch(GOOGLE_URL, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

async function refreshGoogle() {
  try {
    const state = await callGoogle("GET");
    showGoogleState(state);
    return state;
  } catch (error) {
    googleStatus.textContent = `Couldn't check your Google login: ${error.message}`;
    return null;
  }
}

// Login finishes in another tab, so check back until it's done.
function waitForGoogleLogin() {
  clearInterval(googlePoll);
  const deadline = Date.now() + GOOGLE_POLL_LIMIT_MS;
  googlePoll = setInterval(async () => {
    const state = await refreshGoogle();
    if (state?.connected || Date.now() > deadline) clearInterval(googlePoll);
  }, GOOGLE_POLL_MS);
}

async function logInToGoogle() {
  try {
    const { url } = await callGoogle("POST");
    await api.tabs.create({ url });
    googleStatus.textContent = "Finish logging in on the Google tab…";
    waitForGoogleLogin();
  } catch (error) {
    googleStatus.textContent = `Couldn't start the Google login: ${error.message}`;
  }
}

async function linkSheet(event) {
  event.preventDefault();
  sheetSubmit.disabled = true;
  googleStatus.textContent = "Filling your sheet…";
  try {
    showGoogleState(await callGoogle("PATCH", { sheetUrl: sheetUrlInput.value }));
    sheetUrlInput.value = "";
  } catch (error) {
    googleStatus.textContent = `Couldn't use that sheet: ${error.message}`;
  } finally {
    sheetSubmit.disabled = false;
  }
}

async function runGoogleAction(button, method) {
  button.disabled = true;
  try {
    showGoogleState(await callGoogle(method));
  } catch (error) {
    googleStatus.textContent = `That didn't work: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function showResumeTypes(types) {
  const selected = uploadTarget.value;
  const options = [new Option("New resume", NEW_RESUME)];
  for (const { type, label } of types) options.push(new Option(`Replace ${label}`, type));
  uploadTarget.replaceChildren(...options);
  if (types.some((t) => t.type === selected)) uploadTarget.value = selected;
  syncUploadFields();
}

function syncUploadFields() {
  const isNew = uploadTarget.value === NEW_RESUME;
  uploadNameField.hidden = !isNew;
  uploadName.required = isNew;
}

async function refreshResumeTypes() {
  try {
    const res = await fetch(UPLOAD_URL);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showResumeTypes(data.types);
  } catch (error) {
    uploadStatus.textContent = `Couldn't list your resumes: ${error.message}`;
  }
}

function sendUploadToApp(resumeType) {
  if (workbenchReady) {
    frame.contentWindow.postMessage({ type: "taylor:resume-uploaded", resumeType }, APP_ORIGIN);
  } else {
    pendingUpload = resumeType;
  }
}

async function uploadResume(event) {
  event.preventDefault();
  const [file] = uploadFile.files;
  if (!file.name.toLowerCase().endsWith(".tex")) {
    uploadStatus.textContent = "Taylor can only tailor LaTeX, so choose a .tex file.";
    return;
  }
  isUploading = true;
  syncButtons();
  uploadStatus.textContent = "Uploading and reading your resume…";
  try {
    const target = uploadTarget.value;
    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texSource: await file.text(),
        ...(target === NEW_RESUME ? { name: uploadName.value } : { replaceType: target }),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    uploadStatus.textContent = data.message;
    uploadForm.reset();
    showResumeTypes(data.types);
    sendUploadToApp(data.type);
  } catch (error) {
    uploadStatus.textContent = `Upload failed: ${error.message}`;
  } finally {
    isUploading = false;
    syncButtons();
  }
}

// Runs inside the job posting, so it can't use anything from this file.
function readJobText(RANK) {
  const heading = (title, body) => (title ? `${title}\n\n${body}` : body);
  const pageText = document.body?.innerText?.trim() ?? "";

  const selected = window.getSelection()?.toString().trim();
  if (selected) return { text: selected, rank: RANK.SELECTION };

  // The job description element, on boards that label it.
  const containers = document.querySelectorAll(
    [
      "#job-details",
      "#jobDescriptionText",
      ".jobs-box__html-content",
      "[data-automation-id='jobPostingDescription']",
      "[class*='job-description' i]",
      "[class*='jobdescription' i]",
      "[class*='job_description' i]",
      "[id*='job-description' i]",
      "[id*='jobdescription' i]",
      "[id*='job_description' i]",
    ].join(","),
  );
  let longest = "";
  for (const el of containers) {
    const text = el.innerText?.trim() ?? "";
    if (text.length > longest.length) longest = text;
  }
  if (longest.length >= 200) {
    return { text: heading(document.title, longest), rank: RANK.POSTING };
  }

  // Structured data that job boards publish for search engines.
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const items = [data, ...(Array.isArray(data) ? data : []), ...(data?.["@graph"] ?? [])];
    const job = items.find((item) => [].concat(item?.["@type"]).includes("JobPosting"));
    if (!job?.description) continue;
    // Single-page apps can leave the previous job's data behind after navigating.
    if (job.title && !pageText.toLowerCase().includes(job.title.toLowerCase())) continue;

    const company = job.hiringOrganization?.name;
    const place = [].concat(job.jobLocation)[0]?.address?.addressLocality;
    const title = [job.title, company && `at ${company}`, place && `in ${place}`]
      .filter(Boolean)
      .join(" ");
    const html = job.description.replace(/<\/(p|li|div|h\d)>|<br\s*\/?>/gi, "$&\n");
    const body = new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
    return { text: heading(title, body), rank: RANK.POSTING };
  }

  const main = document.querySelector("main, article, [role='main']");
  const mainText = main?.innerText?.trim() ?? "";
  return { text: mainText.length >= 200 ? mainText : pageText, rank: RANK.PAGE };
}

// The panel may be its own window, so look for the last browser window the user
// was in rather than the current one.
async function getActiveJobTab() {
  const win = await api.windows.getLastFocused({ windowTypes: ["normal"] });
  const [tab] = await api.tabs.query({ active: true, windowId: win.id });
  return tab;
}

// Job boards often embed the posting in an iframe, so read every frame and keep
// the longest text from the most trustworthy source.
function pickJobText(results) {
  const frames = results.map((r) => r.result).filter((r) => r?.text);
  return frames.reduce(
    (best, f) =>
      f.rank > best.rank || (f.rank === best.rank && f.text.length > best.text.length)
        ? f
        : best,
    { text: "", rank: 0 },
  );
}

/** Reads the job in the active tab. Returns null after telling the user why it couldn't. */
async function readJobFromActiveTab() {
  showNotice("");
  // Must be the first await: Chrome requires a user gesture for this prompt.
  const granted = await api.permissions.request({ origins: ["<all_urls>"] });
  if (!granted) {
    showNotice("Taylor needs site access to read job postings. You can still paste the JD below.");
    return null;
  }

  isReading = true;
  syncButtons();
  try {
    const tab = await getActiveJobTab();
    if (!tab?.id) throw new Error("No active tab");
    const results = await api.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: readJobText,
      args: [{ PAGE: RANK_PAGE, POSTING: RANK_POSTING, SELECTION: RANK_SELECTION }],
    });
    const { text, rank } = pickJobText(results);
    if (!text) throw new Error("No text found");
    return { jdText: text, jdUrl: /^https?:/.test(tab.url) ? tab.url : "", rank };
  } catch {
    showNotice("Couldn't read this page (browser pages and PDFs are off limits). Paste the JD below instead.");
    return null;
  } finally {
    isReading = false;
    syncButtons();
  }
}

// Only unlabeled pages need checking: the rest are a selection or a known posting.
function looksLikeJob({ jdText, rank }) {
  if (jdText.length < MIN_JD_LENGTH) return false;
  if (rank > RANK_PAGE) return true;
  return jdText.length <= MAX_UNVERIFIED_PAGE_LENGTH && JOB_WORDS.test(jdText);
}

function sendJdToApp(jd) {
  if (workbenchReady) {
    frame.contentWindow.postMessage(jd, APP_ORIGIN);
  } else {
    // The frame is on My Applications or still loading; deliver once ready.
    pendingJd = jd;
    frame.src = APP_URL;
  }
}

/** Fills in Job input for review. */
async function useThisPage() {
  const job = await readJobFromActiveTab();
  if (job) sendJdToApp({ type: "taylor:jd", jdText: job.jdText, jdUrl: job.jdUrl });
}

/** Reads the job on screen and builds a tailored resume with no further input. */
async function createResumeFromScreen() {
  const job = await readJobFromActiveTab();
  if (!job) return;
  if (!looksLikeJob(job)) {
    showNotice("This doesn't look like a job posting. Select the job text on the page, then try again.");
    return;
  }
  showNotice("Reading the job posting…");
  sendJdToApp({ type: "taylor:jd", jdText: job.jdText, jdUrl: job.jdUrl, autoRun: true });
}

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== APP_ORIGIN) return;
  if (event.data?.type === "taylor:unready") workbenchReady = false;
  if (event.data?.type === "taylor:ready") {
    workbenchReady = true;
    // Tells the app which extension origin to send its status to.
    frame.contentWindow.postMessage({ type: "taylor:hello" }, APP_ORIGIN);
    if (pendingJd) {
      frame.contentWindow.postMessage(pendingJd, APP_ORIGIN);
      pendingJd = null;
    }
    if (pendingUpload) {
      frame.contentWindow.postMessage({ type: "taylor:resume-uploaded", resumeType: pendingUpload }, APP_ORIGIN);
      pendingUpload = null;
    }
  }
  if (event.data?.type === "taylor:status") {
    appBusy = event.data.busy === true;
    syncButtons();
    const { text, pdfUrl } = event.data;
    if (text) showNotice(text, typeof pdfUrl === "string" && pdfUrl.startsWith("/") ? pdfUrl : null);
  }
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "taylor:focus-panel") return;
  api.windows.getCurrent().then((win) => api.windows.update(win.id, { focused: true }));
  sendResponse(true);
});

create.addEventListener("click", createResumeFromScreen);
grab.addEventListener("click", useThisPage);
aiButton.addEventListener("click", () => {
  loginForm.hidden = !loginForm.hidden;
  aiButton.setAttribute("aria-expanded", String(!loginForm.hidden));
});
providerInput.addEventListener("change", syncProviderFields);
loginForm.addEventListener("submit", submitLogin);
logout.addEventListener("click", logOut);
sheetButton.addEventListener("click", () => {
  googlePanel.hidden = !googlePanel.hidden;
  sheetButton.setAttribute("aria-expanded", String(!googlePanel.hidden));
  if (!googlePanel.hidden) refreshGoogle();
});
resumesButton.addEventListener("click", () => {
  uploadForm.hidden = !uploadForm.hidden;
  resumesButton.setAttribute("aria-expanded", String(!uploadForm.hidden));
  if (!uploadForm.hidden) refreshResumeTypes();
});
uploadTarget.addEventListener("change", syncUploadFields);
uploadForm.addEventListener("submit", uploadResume);
googleConnect.addEventListener("click", logInToGoogle);
sheetForm.addEventListener("submit", linkSheet);
googleSync.addEventListener("click", () => runGoogleAction(googleSync, "PUT"));
googleLogout.addEventListener("click", () => runGoogleAction(googleLogout, "DELETE"));
document.getElementById("retry").addEventListener("click", connect);
syncProviderFields();
connect();
