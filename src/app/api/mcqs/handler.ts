import { NextResponse } from "next/server";
import { firstZodError } from "@/lib/auth-schemas";
import { createMcqBodySchema } from "@/lib/mcq-schemas";
import {
	McqNotFoundError,
	McqValidationError,
	createMcq,
	listMcqs,
} from "@/lib/services/mcq-service";

export async function GET() {
	try {
		const mcqs = await listMcqs();
		return NextResponse.json({ mcqs });
	} catch {
		return NextResponse.json({ error: "Unable to list questions" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = createMcqBodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
	}

	try {
		const mcq = await createMcq(parsed.data);
		return NextResponse.json({ mcq }, { status: 201 });
	} catch (error) {
		if (error instanceof McqValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 });
		}
		return NextResponse.json({ error: "Unable to create question" }, { status: 500 });
	}
}
