const api = globalThis.browser ?? chrome;
const PANEL_URL = api.runtime.getURL("sidepanel.html");

// For browsers with no sidebar API. An open panel answers and focuses itself.
async function openPanelWindow() {
  try {
    if (await api.runtime.sendMessage({ type: "swift-taylor:focus-panel" })) return;
  } catch {
    // Nothing is listening, so no panel is open.
  }
  await api.windows.create({ url: PANEL_URL, type: "popup", width: 420, height: 800 });
}

if (api.sidePanel) {
  // Chrome, Edge, Brave and other Chromium browsers.
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else if (api.sidebarAction) {
  // Firefox.
  api.action.onClicked.addListener(() => api.sidebarAction.toggle());
} else {
  // Safari, and anything else without a sidebar API.
  api.action.onClicked.addListener(openPanelWindow);
}
