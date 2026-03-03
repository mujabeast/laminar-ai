function getOpenAIStatus() {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY);
  const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4.1-mini";
  const baseUrl =
    process.env.OPENAI_BASE_URL ||
    process.env.AZURE_OPENAI_BASE_URL ||
    "https://api.openai.com/v1";
  const provider = baseUrl.includes("azure.com") ? "Azure OpenAI" : "OpenAI";
  const hasPricing =
    Boolean(process.env.OPENAI_INPUT_COST_PER_1M_TOKENS) &&
    Boolean(process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS);

  return {
    hasApiKey,
    model,
    provider,
    hasPricing,
  };
}

export function OpenAIStatusBanner() {
  const status = getOpenAIStatus();
  const tone = status.hasApiKey
    ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
    : "border-amber-200 bg-amber-50/90 text-amber-950";
  const dotTone = status.hasApiKey ? "bg-emerald-500" : "bg-amber-500";

  return (
    <div className="px-4 pt-4">
      <div className="mx-auto flex max-w-6xl justify-end">
        <div
          className={`inline-flex max-w-full items-center gap-3 rounded-full border px-4 py-2 text-xs shadow-sm backdrop-blur ${tone}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${dotTone}`} />
          <span className="font-semibold">
            {status.hasApiKey ? `${status.provider} connected` : "AI provider missing"}
          </span>
          <span className="hidden sm:inline">Model: {status.model}</span>
          <span className="hidden md:inline">
            {status.hasPricing ? "Cost logging enabled" : "Token logging only"}
          </span>
        </div>
      </div>
    </div>
  );
}
