export function jsonResult(value: unknown) {
  const structuredContent =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : { value };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent,
  };
}
