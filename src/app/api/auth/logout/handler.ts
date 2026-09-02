import { NextResponse } from "next/server";

export async function POST(_request: Request) {
	try {
		return NextResponse.json({ ok: true }, { status: 200 });
	} catch {
		return NextResponse.json({ error: "Unable to log out" }, { status: 500 });
	}
}
