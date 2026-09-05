import { describe, expect, it } from "vitest";
import {
  isLocalStoragePath,
  shouldFallbackToLocal,
  toLocalStoragePath,
} from "@/lib/storage/fileStore";

describe("fileStore", () => {
  it("marks local paths", () => {
    expect(toLocalStoragePath("leave-attachments", "a/b.pdf")).toBe(
      "local:leave-attachments/a/b.pdf"
    );
    expect(isLocalStoragePath("local:leave-attachments/a/b.pdf")).toBe(true);
    expect(isLocalStoragePath("a/b.pdf")).toBe(false);
  });

  it("detects storage schema permission errors for fallback", () => {
    expect(
      shouldFallbackToLocal("permission denied for schema storage")
    ).toBe(true);
    expect(shouldFallbackToLocal("Bucket not found")).toBe(true);
    expect(shouldFallbackToLocal("network timeout")).toBe(false);
  });
});
