import { describe, expect, it } from "vitest";
import { formatStoragePermissionError } from "@/lib/storage/errors";

describe("formatStoragePermissionError", () => {
  it("maps schema storage permission denied", () => {
    expect(formatStoragePermissionError("permission denied for schema storage")).toContain(
      "fix-storage-schema-grants.sql"
    );
  });

  it("maps missing bucket", () => {
    expect(formatStoragePermissionError("Bucket not found")).toContain("bucket");
  });

  it("passes through other messages", () => {
    expect(formatStoragePermissionError("network timeout")).toBe("network timeout");
  });
});
