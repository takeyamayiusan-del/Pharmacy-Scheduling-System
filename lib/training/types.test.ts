import { describe, expect, it } from "vitest";
import { validateQuizDraft } from "@/lib/training/types";

describe("training quiz validation", () => {
  it("requires at least one question", () => {
    expect(validateQuizDraft([])).toMatch(/至少/);
  });

  it("requires correct option", () => {
    expect(
      validateQuizDraft([
        {
          questionText: "Q1",
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ],
          correctOptionId: "z",
        },
      ])
    ).toMatch(/正確答案/);
  });
});
