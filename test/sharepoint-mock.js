// test/sharepoint-mock.js — Mock for SharePoint upload module.
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
