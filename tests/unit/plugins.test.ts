import { describe, expect, it } from "vitest";
import { checkDefinition } from "@/lib/plugins/runtime";
import { definePlugin } from "@/lib/plugins/define";
import { PLUGINS } from "@plugins";

const valid = {
  id: "my-plugin",
  name: "My plugin",
  version: "1.0.0",
  description: "Does a thing",
  author: "Dev",
  minimumCmsVersion: "1.0.0",
  activate: () => undefined,
};

describe("plugin definitions", () => {
  it("accepts a well-formed definition", () => {
    expect(checkDefinition(valid)).toEqual([]);
    expect(definePlugin(valid).id).toBe("my-plugin");
  });

  it("refuses ids that could be used to address other files or rows", () => {
    for (const id of ["../evil", "Bad Id", "a", "x/y", "UPPER", ""]) {
      expect(checkDefinition({ ...valid, id }).length, id).toBeGreaterThan(0);
    }
  });

  it("refuses malformed versions and a missing activate function", () => {
    expect(checkDefinition({ ...valid, version: "one" }).length).toBeGreaterThan(0);
    expect(checkDefinition({ ...valid, minimumCmsVersion: "1.0" }).length).toBeGreaterThan(0);
    const withoutActivate = { ...valid, activate: undefined };
    expect(checkDefinition(withoutActivate).length).toBeGreaterThan(0);
  });

  it("refuses settings that do not follow the setting format", () => {
    const bad = { ...valid, settings: [{ key: "Bad Key", label: "x", type: "text", default: "" }] };
    expect(checkDefinition(bad).length).toBeGreaterThan(0);
  });

  it("the project plugin list is valid and has unique ids", () => {
    const ids = PLUGINS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const plugin of PLUGINS) expect(checkDefinition(plugin), plugin.id).toEqual([]);
  });
});
