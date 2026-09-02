import { McqForm } from "@/components/mcq-form";

export default async function NewMcqPage({
	searchParams,
}: {
	searchParams: Promise<{ userId?: string }>;
}) {
	const { userId } = await searchParams;
	return <McqForm mode="create" createdByUserId={userId} />;
}
