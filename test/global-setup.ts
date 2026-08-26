import type { FullConfig } from "@playwright/test";

/**
 * Refuse to run against an instance that talks to the real LLM.
 *
 * The suite defaults to `http://localhost:8000`, which is also the port the
 * user's own container occupies (scripts/start_windows.ps1, real GROQ_API_KEY,
 * persistent `artifinancial-data` volume). Pointed there, the chat specs spend
 * real Groq quota and execute real trades against the user's saved portfolio.
 *
 * `/api/health` is asked to declare the mode. Until the backend reports it this
 * degrades to a warning, so nothing here can block a correct run.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = process.env.BASE_URL ?? config.projects[0]?.use?.baseURL ?? "";
  const response = await fetch(`${baseURL}/api/health`);
  const health = (await response.json()) as { llm_mock?: boolean };

  if (health.llm_mock === false) {
    throw new Error(
      `${baseURL} is running with LLM_MOCK=false. The E2E suite executes trades and ` +
        `sends chat turns; run it against a test container (see docker-compose.test.yml) ` +
        `or set BASE_URL to one.`,
    );
  }
  if (health.llm_mock === undefined) {
    console.warn(
      `[e2e] ${baseURL}/api/health does not report llm_mock - cannot confirm this is a ` +
        `test instance. Check you are not pointed at your own running app.`,
    );
  }
}

export default globalSetup;
