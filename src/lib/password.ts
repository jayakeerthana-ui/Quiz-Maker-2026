export async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function timingSafeEqual(left: string, right: string): boolean {
	const length = Math.max(left.length, right.length);
	let mismatch = left.length === right.length ? 0 : 1;
	for (let index = 0; index < length; index += 1) {
		const leftCode = index < left.length ? left.charCodeAt(index) : 0;
		const rightCode = index < right.length ? right.charCodeAt(index) : 0;
		mismatch |= leftCode ^ rightCode;
	}
	return mismatch === 0;
}
