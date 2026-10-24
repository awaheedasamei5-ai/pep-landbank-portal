import test from "node:test";
import assert from "node:assert/strict";

import { fmtLongDate } from "../src/webnext/shared/lib/format.ts";

test("long date formats date-only and database timestamp values", () => {
	assert.equal(fmtLongDate("2026-10-24"), "24 October 2026");
	assert.equal(fmtLongDate("2026-10-24T13:45:00.000Z"), "24 October 2026");
});

test("long date safely omits blank or malformed values", () => {
	assert.equal(fmtLongDate(""), "");
	assert.equal(fmtLongDate("not-a-date"), "");
});
