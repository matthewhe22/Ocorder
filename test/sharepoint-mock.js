// test/sharepoint-mock.js
// Mocks the SharePoint upload module so tests never make real Graph API calls.
//
// Usage:
//   import { mockSharePointEnabled, mockSharePointDisabled } from "../../test/sharepoint-mock.js";
//   mockSharePointEnabled();   // SP upload returns a URL
//   mockSharePointDisabled();  // SP upload returns null / SHAREPOINT_ENABLED is false

import { vi } from "vitest";

export function mockSharePointEnabled(returnUrl = "https://sp.example.com/file") {
  vi.mock("../api/_lib/sharepoint.js", () => ({
    uploadToSharePoint: vi.fn(async () => returnUrl),
    SHAREPOINT_ENABLED: true,
    FOLDER_PATH: "Test/Folder",
  }));
}

export function mockSharePointDisabled() {
  vi.mock("../api/_lib/sharepoint.js", () => ({
    uploadToSharePoint: vi.fn(async () => null),
    SHAREPOINT_ENABLED: false,
    FOLDER_PATH: "Test/Folder",
  }));
}
