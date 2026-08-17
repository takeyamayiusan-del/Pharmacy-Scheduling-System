import { describe, expect, it } from "vitest";
import {
  formatMedicineQty,
  validateCustomerDraft,
  validateMedicineDraft,
  validateProcurementDraft,
  type MedicineRequest,
} from "@/lib/shop-ops/types";

describe("shop-ops validation", () => {
  it("日常採購要有類別、品名、數量", () => {
    expect(validateProcurementDraft({ categoryId: "", itemName: "筆", quantity: 1 })).toMatch(/類別/);
    expect(validateProcurementDraft({ categoryId: "c1", itemName: "", quantity: 1 })).toMatch(/品名/);
    expect(validateProcurementDraft({ categoryId: "c1", itemName: "筆", quantity: 0 })).toMatch(/數量/);
    expect(validateProcurementDraft({ categoryId: "c1", itemName: "筆", quantity: 2 })).toBeNull();
  });

  it("預包／欠藥可直接填數量，或只勾 IC02／IC03 其中一個", () => {
    const base = {
      itemName: "Amlodipine",
      kind: "prepack" as const,
      quantity: "",
      useIc02: false,
      ic02Qty: "",
      useIc03: false,
      ic03Qty: "",
      currentStock: "",
    };
    expect(validateMedicineDraft({ ...base, qtyMode: "direct", quantity: 30 })).toBeNull();
    expect(validateMedicineDraft({ ...base, qtyMode: "direct", quantity: "" })).toMatch(/數量/);
    expect(
      validateMedicineDraft({ ...base, qtyMode: "refill", useIc02: true, ic02Qty: 14 })
    ).toBeNull();
    expect(
      validateMedicineDraft({ ...base, qtyMode: "refill", useIc03: true, ic03Qty: 28 })
    ).toBeNull();
    expect(validateMedicineDraft({ ...base, qtyMode: "refill" })).toMatch(/IC02/);
    expect(
      validateMedicineDraft({ ...base, qtyMode: "refill", useIc02: true, ic02Qty: "" })
    ).toMatch(/第二次/);
  });

  it("低於庫存要填現存（可為 0）", () => {
    expect(
      validateMedicineDraft({
        itemName: "藥",
        kind: "below_stock",
        qtyMode: "direct",
        quantity: "",
        useIc02: false,
        ic02Qty: "",
        useIc03: false,
        ic03Qty: "",
        currentStock: "",
      })
    ).toMatch(/現存/);
    expect(
      validateMedicineDraft({
        itemName: "藥",
        kind: "below_stock",
        qtyMode: "direct",
        quantity: "",
        useIc02: false,
        ic02Qty: "",
        useIc03: false,
        ic03Qty: "",
        currentStock: 0,
      })
    ).toBeNull();
  });

  it("客人訂購姓名電話商品數量金額", () => {
    const ok = {
      customerName: "王小明",
      customerPhone: "0912345678",
      productName: "血糖試紙",
      quantity: 2,
      amount: 600,
    };
    expect(validateCustomerDraft(ok)).toBeNull();
    expect(validateCustomerDraft({ ...ok, customerName: "" })).toMatch(/姓名/);
    expect(validateCustomerDraft({ ...ok, amount: 0 })).toBeNull();
  });

  it("叫藥數量摘要", () => {
    const row: MedicineRequest = {
      id: "1",
      siteId: "jiji",
      kind: "shortage",
      itemName: "藥",
      qtyMode: "refill",
      quantity: null,
      useIc02: true,
      ic02Qty: 14,
      useIc03: false,
      ic03Qty: null,
      currentStock: null,
      note: "",
      status: "pending",
      createdBy: "u",
      closedBy: null,
      closedAt: null,
      createdAt: "",
    };
    expect(formatMedicineQty(row)).toBe("IC02 第二次 14");
    expect(formatMedicineQty({ ...row, kind: "below_stock", currentStock: 3 })).toBe("現存 3");
  });
});
