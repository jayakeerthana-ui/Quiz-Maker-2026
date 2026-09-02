import { NextResponse } from "next/server";
import { getAttemptById } from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { id } = await context.params;
	try {
		const attempt = await getAttemptById(id);
		if (!attempt) {
			return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
		}
		return NextResponse.json({ attempt });
	} catch {
		return NextResponse.json({ error: "Unable to load attempt" }, { status: 500 });
	}
}
