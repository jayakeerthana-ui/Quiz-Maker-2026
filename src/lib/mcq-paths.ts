export function mcqHomeHref(userId?: string) {
	if (!userId) {
		return "/mcq";
	}
	return `/mcq?userId=${encodeURIComponent(userId)}`;
}

export function mcqNewHref(userId?: string) {
	if (!userId) {
		return "/mcq/new";
	}
	return `/mcq/new?userId=${encodeURIComponent(userId)}`;
}

export function mcqEditHref(id: string, userId?: string) {
	const path = `/mcq/${id}/edit`;
	if (!userId) {
		return path;
	}
	return `${path}?userId=${encodeURIComponent(userId)}`;
}

export function mcqPreviewHref(id: string, userId?: string) {
	const path = `/mcq/${id}/preview`;
	if (!userId) {
		return path;
	}
	return `${path}?userId=${encodeURIComponent(userId)}`;
}
