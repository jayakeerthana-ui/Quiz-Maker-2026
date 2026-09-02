import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/password";

describe("sha256Hex", () => {
	it("produces the same hex digest for the same input", async () => {
		const first = await sha256Hex("teacher-password");
		const second = await sha256Hex("teacher-password");
		expect(first).toBe(second);
	});

	it("returns a 64-character lowercase hex digest", async () => {
		const digest = await sha256Hex("teacher-password");
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
	});

	it("does not return the plaintext input", async () => {
		const plaintext = "teacher-password";
		const digest = await sha256Hex(plaintext);
		expect(digest).not.toBe(plaintext);
	});

	it("produces different digests for different inputs", async () => {
		const first = await sha256Hex("teacher-password");
		const second = await sha256Hex("other-password");
		expect(first).not.toBe(second);
	});
});
