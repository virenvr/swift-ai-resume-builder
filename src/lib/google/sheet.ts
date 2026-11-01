import { getStore } from "@/lib/tracker/store";
import { STATUS_LABELS, type ApplicationRecord } from "@/lib/tracker/types";
import {
  getAccessToken,
  readGoogleLogin,
  updateGoogleLogin,
} from "./login";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
// Added to a linked spreadsheet when the tab in the link already holds other data.
const NEW_TAB_TITLE = "Taylor Applications";
const REQUEST_TIMEOUT_MS = 30_000;

// Sync finds rows by the ID, so it must stay the last column. Update LAST_COLUMN to match.
const COLUMNS: [string, (r: ApplicationRecord) => string | number][] = [
  ["Applied", (r) => new Date(r.appliedAt).toLocaleDateString("en-CA")],
  ["Company", (r) => r.company],
  ["Role", (r) => r.roleTitle],
  ["Status", (r) => STATUS_LABELS[r.status]],
  ["Location", (r) => r.headerLocation || r.overrideLocation || r.detectedLocation],
  ["Work arrangement", (r) => r.workArrangement],
  ["Seniority", (r) => r.seniority],
  ["Resume", (r) => r.resumeTypeLabel || r.resumeType],
  ["ATS coverage", (r) => (r.coverageHigh == null ? "" : Math.round(r.coverageHigh * 100))],
  ["Job URL", (r) => r.jdUrl],
  ["Notes", (r) => r.notes],
  ["ID", (r) => r.id],
];
const FIRST_COLUMN = "A";
const LAST_COLUMN = "L";

class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function callSheets<T>(token: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleApiError(res.status, data.error?.message || `Google Sheets error ${res.status}`);
  }
  return data;
}

interface Tab {
  spreadsheetId: string;
  sheetId: number;
  title: string;
}

/** Reads the spreadsheet ID and optional tab ID from a Google Sheets link. */
function parseSheetLink(link: string): { spreadsheetId: string; gid?: number } {
  const invalid = new Error(
    "That isn't a Google Sheets link. Copy it from your browser's address bar while the sheet is open.",
  );
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw invalid;
  }
  // The length rule also rejects "Publish to web" links (/d/e/...), which the API can't open.
  const match = /^\/spreadsheets\/d\/([\w-]{20,})/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !match) throw invalid;
  const gid = /(?:^|[?#&])gid=(\d+)/.exec(url.search + url.hash)?.[1];
  return { spreadsheetId: match[1], gid: gid === undefined ? undefined : Number(gid) };
}

/** Every tab, looked up each time because the user can rename them. */
async function listTabs(token: string, spreadsheetId: string): Promise<Tab[]> {
  try {
    const { sheets } = await callSheets<{
      sheets: { properties: { sheetId: number; title: string } }[];
    }>(token, `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
    return sheets.map(({ properties: { sheetId, title } }) => ({ spreadsheetId, sheetId, title }));
  } catch (error) {
    if (error instanceof GoogleApiError && [403, 404].includes(error.status)) {
      throw new Error(
        `Couldn't open that sheet. Check that the Google account you logged in with can edit it. Google said: ${error.message}`,
      );
    }
    throw error;
  }
}

async function readRows(token: string, tab: Tab): Promise<string[][]> {
  const range = encodeURIComponent(`${quoteTitle(tab)}!${FIRST_COLUMN}:${LAST_COLUMN}`);
  const { values = [] } = await callSheets<{ values?: string[][] }>(
    token,
    `${SHEETS_API}/${tab.spreadsheetId}/values/${range}`,
  );
  return values;
}

const quoteTitle = (tab: Tab) => `'${tab.title.replaceAll("'", "''")}'`;

// Syncing rewrites row 1 and any row whose ID it knows, so it may only ever touch a tab
// with nothing in Taylor's columns, or one that has Taylor's exact header.
function isSafeToSync(rows: string[][]): boolean {
  return rows.length === 0 || COLUMNS.every(([header], i) => rows[0][i] === header);
}

/** The tab in the link if it's safe to write to, otherwise a separate tab for Taylor. */
async function chooseTab(token: string, spreadsheetId: string, gid?: number): Promise<Tab> {
  const tabs = await listTabs(token, spreadsheetId);
  const linked = tabs.find((t) => t.sheetId === gid) ?? tabs[0];
  if (isSafeToSync(await readRows(token, linked))) return linked;

  const existing = tabs.find((t) => t.title === NEW_TAB_TITLE);
  if (existing) {
    if (isSafeToSync(await readRows(token, existing))) return existing;
    throw new Error(
      `This sheet already has a tab called "${NEW_TAB_TITLE}" holding other data. Rename it, or link an empty tab.`,
    );
  }

  const { replies } = await callSheets<{
    replies: { addSheet: { properties: { sheetId: number } } }[];
  }>(token, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    requests: [
      {
        addSheet: {
          properties: { title: NEW_TAB_TITLE, gridProperties: { frozenRowCount: 1 } },
        },
      },
    ],
  });
  const { sheetId } = replies[0].addSheet.properties;
  return { spreadsheetId, sheetId, title: NEW_TAB_TITLE };
}

/** Points Taylor at the sheet in the link, then fills it. Sync problems land in lastError. */
export async function connectSheet(link: string): Promise<void> {
  const { spreadsheetId, gid } = parseSheetLink(link);
  const { refreshToken } = readGoogleLogin();
  if (!refreshToken) throw new Error("Log in with Google first.");
  const token = await getAccessToken(refreshToken);
  const tab = await chooseTab(token, spreadsheetId, gid);
  updateGoogleLogin({ spreadsheetId: tab.spreadsheetId, sheetId: tab.sheetId });
  await syncSheet();
}

/**
 * Copies the tracker into the sheet: updates rows it knows and appends new ones. Rows are
 * never removed, so the sheet keeps applications deleted from the tracker as history.
 * Columns to the right of the ID are left alone.
 * Comparing the whole list means a failed sync catches up the next time one runs.
 */
async function writeApplications(token: string, tab: Tab, records: ApplicationRecord[]) {
  const sheet = quoteTitle(tab);
  const url = `${SHEETS_API}/${tab.spreadsheetId}`;

  // Checked on every sync: inserting a column would otherwise make other data look like IDs.
  const rows = await readRows(token, tab);
  if (!isSafeToSync(rows)) {
    throw new Error(
      `The header row in the "${tab.title}" tab has changed, so Taylor stopped to avoid damaging your data. Restore it, or link another tab.`,
    );
  }
  const idColumn = COLUMNS.length - 1;
  const rowById = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row[idColumn] && index > 0) rowById.set(row[idColumn], index + 1);
  });

  const toRow = (record: ApplicationRecord) => COLUMNS.map(([, read]) => read(record));
  const rowRange = (row: number) => `${sheet}!${FIRST_COLUMN}${row}:${LAST_COLUMN}${row}`;

  // RAW, always: job postings are untrusted, and a company name like =IMPORTXML(...)
  // would otherwise run as a formula and could send the sheet's contents elsewhere.
  await callSheets(token, `${url}/values:batchUpdate`, {
    valueInputOption: "RAW",
    data: [
      { range: rowRange(1), values: [COLUMNS.map(([header]) => header)] },
      ...records
        .filter((r) => rowById.has(r.id))
        .map((r) => ({ range: rowRange(rowById.get(r.id)!), values: [toRow(r)] })),
    ],
  });

  // Oldest first, so the newest application ends up at the bottom.
  const added = records.filter((r) => !rowById.has(r.id)).reverse();
  if (added.length) {
    const range = encodeURIComponent(`${sheet}!${FIRST_COLUMN}:${LAST_COLUMN}`);
    await callSheets(
      token,
      `${url}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: added.map(toRow) },
    );
  }
}

async function runSync(): Promise<void> {
  const { refreshToken, spreadsheetId, sheetId } = readGoogleLogin();
  if (!refreshToken || !spreadsheetId || sheetId === undefined) return;
  try {
    const token = await getAccessToken(refreshToken);
    const tabs = await listTabs(token, spreadsheetId);
    const tab = tabs.find((t) => t.sheetId === sheetId);
    if (!tab) throw new Error("Taylor's tab is gone from your sheet. Link a sheet again.");
    await writeApplications(token, tab, await getStore().list());
    updateGoogleLogin({ lastError: undefined, lastSyncedAt: new Date().toISOString() });
  } catch (error) {
    updateGoogleLogin({
      lastError: error instanceof Error ? error.message : "Couldn't update the sheet.",
    });
  }
}

// On globalThis because Next can load this module once per route. Overlapping syncs
// would both append the same new application.
const queue = globalThis as { taylorSheetSync?: Promise<void> };

/** Brings the sheet up to date. Never rejects: failures are saved as lastError. */
export function syncSheet(): Promise<void> {
  // The catch keeps one unexpected failure from blocking every later sync.
  queue.taylorSheetSync = (queue.taylorSheetSync ?? Promise.resolve())
    .then(runSync)
    .catch(console.error);
  return queue.taylorSheetSync;
}
