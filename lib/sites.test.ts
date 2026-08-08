import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_ID,
  parseSiteId,
  storeConfigSettingId,
  SITES,
  SYSTEM_NAME,
} from "@/lib/sites";

describe("sites", () => {
  it("uses Jiahe system brand name", () => {
    expect(SYSTEM_NAME).toBe("家禾體系排班系統");
  });

  it("defaults to zhushan", () => {
    expect(DEFAULT_SITE_ID).toBe("zhushan");
    expect(parseSiteId(undefined)).toBe("zhushan");
    expect(parseSiteId("nope")).toBe("zhushan");
    expect(parseSiteId("jiji")).toBe("jiji");
  });

  it("keeps zhushan store_config key for backward compatibility", () => {
    expect(storeConfigSettingId("zhushan")).toBe("store_config");
    expect(storeConfigSettingId("jiji")).toBe("store_config:jiji");
  });

  it("jiji uses custom shift catalog; zhushan does not", () => {
    expect(SITES.zhushan.customShiftCatalog).toBe(false);
    expect(SITES.jiji.customShiftCatalog).toBe(true);
    expect(SITES.jiji.defaultStoreName).toBe("家禾藥局");
  });
});
