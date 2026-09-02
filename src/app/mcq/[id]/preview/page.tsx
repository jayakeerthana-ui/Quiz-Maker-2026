import { McqPreview } from "@/components/mcq-preview";

export default async function PreviewMcqPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ userId?: string }>;
}) {
	const { id } = await params;
	const { userId } = await searchParams;
	return <McqPreview mcqId={id} createdByUserId={userId} />;
}
