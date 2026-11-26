import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@/lib/reports/types";
import { moveKey, orderColumns } from "./columnLayout";

const c = (key: string): ColumnDef => ({ key, header: key.toUpperCase(), type: "text" });

describe("column layout", () => {
  it("moveKey: dragging right inserts after the target, dragging left inserts before it", () => {
    expect(moveKey(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveKey(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveKey(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });

  it("orderColumns: saved order first, unknown saved keys dropped, new columns appended", () => {
    expect(orderColumns([c("a"), c("b"), c("c")], ["c", "zz", "a"]).map((x) => x.key)).toEqual(["c", "a", "b"]);
    expect(orderColumns([c("a"), c("b")], []).map((x) => x.key)).toEqual(["a", "b"]);
  });
});
