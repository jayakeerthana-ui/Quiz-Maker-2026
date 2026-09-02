import { NextResponse } from "next/server";
import { firstZodError, registerBodySchema } from "@/lib/auth-schemas";
import { sha256Hex } from "@/lib/password";
import { UserConflictError, createUser, toPublicUser } from "@/lib/services/user-service";

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = registerBodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
	}

	try {
		const passwordHash = await sha256Hex(parsed.data.password);
		const user = await createUser({
			firstName: parsed.data.firstName,
			lastName: parsed.data.lastName,
			username: parsed.data.username,
			email: parsed.data.email,
			passwordHash,
		});
		return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
	} catch (error) {
		if (error instanceof UserConflictError) {
			return NextResponse.json({ error: error.message }, { status: 409 });
		}
		return NextResponse.json({ error: "Unable to register" }, { status: 500 });
	}
}
