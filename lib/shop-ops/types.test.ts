import { describe, expect, it } from "vitest";
import {
  formatMedicineQty,
  formatWantedArriveDate,
  fulfillmentStage,
  isCustomerFulfillmentComplete,
  matchesFulfillmentFilter,
  sortCustomerOrders,
  validateCustomerDraft,
  validateMedicineDraft,
  validateProcurementDraft,
  type CustomerOrder,
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
    expect(
      validateMedicineDraft({
        ...base,
        kind: "shortage",
        qtyMode: "direct",
        quantity: 10,
      })
    ).toMatch(/電話/);
    expect(
      validateMedicineDraft({
        ...base,
        kind: "shortage",
        qtyMode: "direct",
        quantity: 10,
        contactPhone: "0912345678",
      })
    ).toBeNull();
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
    expect(validateCustomerDraft({ ...ok, urgency: "urgent", wantedArriveDate: "2026-08-20" })).toBeNull();
    expect(validateCustomerDraft({ ...ok, urgency: "urgent", wantedArriveDate: "8/20" })).toMatch(/希望到貨日/);
  });

  it("叫藥數量摘要", () => {
    const row: MedicineRequest = {
      id: "1",
      siteId: "jiji",
      kind: "shortage",
      itemName: "藥",
      nhiCode: "",
      qtyMode: "refill",
      quantity: null,
      unit: "",
      useIc02: true,
      ic02Qty: 14,
      useIc03: false,
      ic03Qty: null,
      currentStock: null,
      contactPhone: "",
      ordered: false,
      goodsArrived: false,
      notified: false,
      orderedAt: null,
      goodsArrivedAt: null,
      notifiedAt: null,
      note: "",
      status: "pending",
      createdBy: "u",
      closedBy: null,
      closedAt: null,
      createdAt: "",
    };
    expect(formatMedicineQty(row)).toBe("IC02 第二次 14");
    expect(formatMedicineQty({ ...row, unit: "盒" })).toBe("IC02 第二次 14 盒");
    expect(formatMedicineQty({ ...row, kind: "below_stock", currentStock: 3, unit: "瓶" })).toBe(
      "現存 3 瓶"
    );
  });

  it("客訂履約階段：未訂貨 → 已訂未到 → 已到貨未通知 → 已通知未拿 → 已拿", () => {
    const base: CustomerOrder = {
      id: "1",
      siteId: "zhushan",
      customerName: "王",
      customerPhone: "09",
      handlerId: "u",
      productName: "試紙",
      nhiCode: "",
      quantity: 1,
      unit: "盒",
      amount: 100,
      paymentStatus: "unpaid",
      urgency: "normal",
      wantedArriveDate: null,
      ordered: false,
      goodsArrived: false,
      notified: false,
      pickedUp: false,
      orderedAt: null,
      goodsArrivedAt: null,
      notifiedAt: null,
      pickedUpAt: null,
      note: "",
      status: "pending",
      createdBy: "u",
      closedBy: null,
      closedAt: null,
      createdAt: "",
    };
    expect(fulfillmentStage(base)).toBe("not_ordered");
    expect(fulfillmentStage({ ...base, ordered: true })).toBe("not_arrived");
    expect(matchesFulfillmentFilter({ ...base, ordered: true, goodsArrived: true }, "arrived_unnotified")).toBe(
      true
    );
    expect(fulfillmentStage({ ...base, ordered: true, goodsArrived: true, notified: true })).toBe(
      "notified_unpicked"
    );
    expect(
      fulfillmentStage({
        ...base,
        ordered: true,
        goodsArrived: true,
        notified: true,
        pickedUp: true,
      })
    ).toBe("picked");
    expect(
      isCustomerFulfillmentComplete({
        ordered: true,
        goodsArrived: true,
        notified: true,
        pickedUp: true,
      })
    ).toBe(true);
    expect(isCustomerFulfillmentComplete(base)).toBe(false);
    expect(formatWantedArriveDate("2026-08-20")).toBe("2026/08/20");
    expect(sortCustomerOrders([{ ...base, urgency: "normal", createdAt: "2" }, { ...base, id: "2", urgency: "urgent", createdAt: "1" }])[0].urgency).toBe(
      "urgent"
    );
  });
});
