import { NextResponse } from "next/server";
import { firstZodError, loginBodySchema } from "@/lib/auth-schemas";
import { sha256Hex, timingSafeEqual } from "@/lib/password";
import { getUserByLoginIdentifier, toPublicUser } from "@/lib/services/user-service";

const INVALID_CREDENTIALS = "Invalid username/email or password";

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = loginBodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
	}

	try {
		const user = await getUserByLoginIdentifier(parsed.data.identifier);
		if (!user) {
			return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
		}

		const passwordHash = await sha256Hex(parsed.data.password);
		if (!timingSafeEqual(passwordHash, user.passwordHash)) {
			return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
		}

		return NextResponse.json({ user: toPublicUser(user) }, { status: 200 });
	} catch {
		return NextResponse.json({ error: "Unable to log in" }, { status: 500 });
	}
}
