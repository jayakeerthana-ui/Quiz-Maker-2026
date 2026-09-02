import { NextResponse } from "next/server";
import { firstZodError } from "@/lib/auth-schemas";
import { createAttemptBodySchema } from "@/lib/mcq-schemas";
import {
	McqNotFoundError,
	McqValidationError,
	createAttempt,
	listAttemptsByMcqId,
	listAttemptsByUserId,
} from "@/lib/services/mcq-service";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const mcqId = url.searchParams.get("mcqId")?.trim() ?? "";
	const userId = url.searchParams.get("userId")?.trim() ?? "";
	const hasMcqId = mcqId.length > 0;
	const hasUserId = userId.length > 0;

	if (hasMcqId === hasUserId) {
		return NextResponse.json(
			{ error: "Provide exactly one of mcqId or userId" },
			{ status: 400 },
		);
	}

	try {
		const attempts = hasMcqId
			? await listAttemptsByMcqId(mcqId)
			: await listAttemptsByUserId(userId);
		return NextResponse.json({ attempts });
	} catch {
		return NextResponse.json({ error: "Unable to list attempts" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = createAttemptBodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
	}

	try {
		const attempt = await createAttempt(parsed.data);
		return NextResponse.json({ attempt }, { status: 201 });
	} catch (error) {
		if (error instanceof McqValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 });
		}
		return NextResponse.json({ error: "Unable to record attempt" }, { status: 500 });
	}
}
