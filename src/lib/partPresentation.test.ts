import { describe, expect, it } from "vitest";
import type { BeybladePart, PartType } from "./deck";
import { compareParts, partDisplayLabel, partMatchesQuery } from "./partPresentation";

function part(partType: PartType, code: string, name = code): BeybladePart {
  return {
    id: `beyx:${partType}:${code.toLowerCase()}`,
    name,
    nameEn: code,
    code,
    partType,
    system: partType === "blade" ? "UX" : "BX",
    sourcePartId: "",
    functionalCode: code,
    packageId: "",
    setId: "",
    color: "",
    brandSource: "canonical",
  };
}

describe("fast Deck part presentation", () => {
  it("shows functional labels without product metadata", () => {
    expect(partDisplayLabel(part("blade", "WIZARDROD", "魔導神杖"))).toBe("魔導神杖");
    expect(partDisplayLabel(part("ratchet", "7-60"))).toBe("7-60");
    expect(partDisplayLabel(part("bit", "FB", "自由球"))).toBe("FB軸");
  });

  it("shows Over Blades with their code and falls back to English for T", () => {
    expect(partDisplayLabel(part("over_blade", "O", "外圍"))).toBe("外圍(O)");
    expect(partDisplayLabel(part("over_blade", "P", "尖峰"))).toBe("尖峰(P)");
    expect(partDisplayLabel(part("over_blade", "B", "破壞"))).toBe("破壞(B)");
    expect(partDisplayLabel(part("over_blade", "F", "流動"))).toBe("流動(F)");
    expect(partDisplayLabel(part("over_blade", "G", "守護"))).toBe("守護(G)");
    expect(partDisplayLabel(part("over_blade", "T"))).toBe("T");
  });

  it.each([
    ["M", "巨大"],
    ["F", "自由"],
    ["H", "沉重"],
    ["W", "車輪"],
    ["V", "垂直"],
    ["O", "奇異"],
    ["E", "抹消"],
    ["A", "突擊"],
    ["G", "重力"],
    ["K", "拳擊"],
    ["S", "斬擊"],
    ["R", "圓弧"],
    ["C", "蓄力"],
    ["Z", "億兆"],
    ["B", "緩衝"],
    ["J", "鋸齒"],
    ["T", "翻轉"],
    ["D", "雙重"],
  ])("shows Assist Blade %s after its Chinese name", (code, name) => {
    expect(partDisplayLabel(part("assist_blade", code, name))).toBe(`${name}(${code})`);
  });

  it.each(["1-60", "7-60", "9-65"])("matches ratchet %s exactly", (query) => {
    const options = [part("ratchet", "1-60"), part("ratchet", "7-60"), part("ratchet", "9-65")];
    expect(
      options.filter((option) => partMatchesQuery(option, query)).map(({ code }) => code),
    ).toEqual([query]);
  });

  it("matches Bit codes without searching English names or metadata", () => {
    const options = [
      part("bit", "R"),
      part("bit", "RA"),
      part("bit", "LR"),
      part("bit", "NR"),
      part("bit", "E"),
      part("bit", "H"),
      part("bit", "FB"),
    ];
    expect(
      options.filter((option) => partMatchesQuery(option, "E")).map(({ code }) => code),
    ).toEqual(["E"]);
    expect(
      options.filter((option) => partMatchesQuery(option, "FB軸")).map(({ code }) => code),
    ).toEqual(["FB"]);
    expect(
      options
        .sort(compareParts)
        .filter((option) => partMatchesQuery(option, "R"))
        .map(({ code }) => code),
    ).toEqual(["LR", "NR", "R", "RA"]);
  });

  it("sorts Ratchets numerically and Bits alphabetically", () => {
    expect(
      ["8-80", "1-60", "8-70", "7-55", "1-50"]
        .map((code) => part("ratchet", code))
        .sort(compareParts)
        .map(({ code }) => code),
    ).toEqual(["1-50", "1-60", "7-55", "8-70", "8-80"]);
    expect(
      ["NR", "DS", "FF", "GU", "LR", "R", "RA"]
        .map((code) => part("bit", code))
        .sort(compareParts)
        .map(({ code }) => code),
    ).toEqual(["DS", "FF", "GU", "LR", "NR", "R", "RA"]);
  });

  it("searches blades by their functional Chinese name", () => {
    const wizardRod = part("blade", "WIZARDROD", "魔導神杖");
    expect(partMatchesQuery(wizardRod, "魔導")).toBe(true);
    expect(partMatchesQuery(wizardRod, "UX-03")).toBe(false);
  });
});
