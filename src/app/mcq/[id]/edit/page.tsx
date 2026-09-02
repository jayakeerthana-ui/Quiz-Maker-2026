import { McqForm } from "@/components/mcq-form";

export default async function EditMcqPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ userId?: string }>;
}) {
	const { id } = await params;
	const { userId } = await searchParams;
	return <McqForm mode="edit" mcqId={id} createdByUserId={userId} />;
}
