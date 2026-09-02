import { McqList } from "@/components/mcq-list";

export default async function McqPage({
	searchParams,
}: {
	searchParams: Promise<{ userId?: string }>;
}) {
	const { userId } = await searchParams;
	return <McqList createdByUserId={userId} />;
}
