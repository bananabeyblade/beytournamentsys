import { describe, expect, it } from "vitest";
import type { BeybladePart, PartType } from "./deck";
import { partDisplayLabel, partMatchesQuery } from "./partPresentation";

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

  it.each(["1-60", "7-60", "9-65"])("matches ratchet %s exactly", (query) => {
    const options = [part("ratchet", "1-60"), part("ratchet", "7-60"), part("ratchet", "9-65")];
    expect(
      options.filter((option) => partMatchesQuery(option, query)).map(({ code }) => code),
    ).toEqual([query]);
  });

  it("matches Bit codes without searching English names or metadata", () => {
    const options = [part("bit", "R"), part("bit", "E"), part("bit", "H"), part("bit", "FB")];
    expect(
      options.filter((option) => partMatchesQuery(option, "E")).map(({ code }) => code),
    ).toEqual(["E"]);
    expect(
      options.filter((option) => partMatchesQuery(option, "FB軸")).map(({ code }) => code),
    ).toEqual(["FB"]);
  });

  it("searches blades by their functional Chinese name", () => {
    const wizardRod = part("blade", "WIZARDROD", "魔導神杖");
    expect(partMatchesQuery(wizardRod, "魔導")).toBe(true);
    expect(partMatchesQuery(wizardRod, "UX-03")).toBe(false);
  });
});
