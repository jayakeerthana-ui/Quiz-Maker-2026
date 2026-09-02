import { describe, expect, it } from "vitest";
import { POST } from "./handler";

describe("POST /api/auth/logout", () => {
	it("returns 200 with { ok: true }", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});
});
