import { NextResponse } from "next/server";
import { firstZodError } from "@/lib/auth-schemas";
import { updateMcqBodySchema } from "@/lib/mcq-schemas";
import {
	McqChoiceInUseError,
	McqNotFoundError,
	McqValidationError,
	deleteMcq,
	getMcqById,
	updateMcq,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { id } = await context.params;
	try {
		const mcq = await getMcqById(id);
		if (!mcq) {
			return NextResponse.json({ error: "Question not found" }, { status: 404 });
		}
		return NextResponse.json({ mcq });
	} catch {
		return NextResponse.json({ error: "Unable to load question" }, { status: 500 });
	}
}

export async function PUT(request: Request, context: RouteContext) {
	const { id } = await context.params;
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = updateMcqBodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
	}

	try {
		const mcq = await updateMcq(id, parsed.data);
		return NextResponse.json({ mcq });
	} catch (error) {
		if (error instanceof McqValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 });
		}
		if (error instanceof McqChoiceInUseError) {
			return NextResponse.json({ error: error.message }, { status: 409 });
		}
		return NextResponse.json({ error: "Unable to update question" }, { status: 500 });
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { id } = await context.params;
	try {
		const removed = await deleteMcq(id);
		if (!removed) {
			return NextResponse.json({ error: "Question not found" }, { status: 404 });
		}
		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json({ error: "Unable to delete question" }, { status: 500 });
	}
}
