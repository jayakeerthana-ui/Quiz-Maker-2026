import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
	const { env } = await getCloudflareContext();
	if (!env.DB) {
		throw new Error("D1 database binding is missing");
	}
	return env.DB;
}
