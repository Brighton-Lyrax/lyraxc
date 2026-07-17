import { AgentOrchestrator } from './application/agent-orchestrator.js';
import { loadConfig, type AppConfig } from './config/index.js';
import type {
  BrowserProvider,
  Planner,
  SafetyPolicy,
  TaskRepository,
} from './domain/ports.js';
import { PlaywrightBrowserProvider } from './infrastructure/browser/playwright-browser.js';
import { createLogger, type Logger } from './infrastructure/logging/logger.js';
import { HeuristicPlanner } from './infrastructure/planner/heuristic-planner.js';
import { OpenAiPlanner } from './infrastructure/planner/openai-planner.js';
import { InMemoryTaskRepository } from './infrastructure/persistence/in-memory-task-repository.js';
import { DomainSafetyPolicy } from './infrastructure/safety/domain-safety-policy.js';

/**
 * The fully-wired application graph. Building it in one place (the composition
 * root) keeps every other module free of concrete construction details.
 */
export interface Container {
  config: AppConfig;
  logger: Logger;
  safety: SafetyPolicy;
  browserProvider: BrowserProvider;
  planner: Planner;
  repository: TaskRepository;
  orchestrator: AgentOrchestrator;
  /** Gracefully release resources (browser, etc.). */
  shutdown(): Promise<void>;
}

/** Select the planner implementation based on configuration. */
function createPlanner(config: AppConfig, logger: Logger): Planner {
  if (config.llm.provider === 'openai') {
    logger.info({ model: config.llm.model }, 'Using OpenAI-compatible planner');
    return new OpenAiPlanner(config.llm, logger);
  }
  logger.info('Using offline heuristic planner (LLM_PROVIDER=mock)');
  return new HeuristicPlanner();
}

/**
 * Construct the application container.
 * @param overrides Optional partial config for tests/embedding.
 */
export function createContainer(overrides?: Partial<AppConfig>): Container {
  const config = { ...loadConfig(), ...overrides } as AppConfig;
  const logger = createLogger(config);

  const safety: SafetyPolicy = new DomainSafetyPolicy(
    config.safety.allowedDomains,
    config.safety.blockedDomains,
  );
  const browserProvider = new PlaywrightBrowserProvider(config, safety, logger);
  const planner = createPlanner(config, logger);
  const repository = new InMemoryTaskRepository();
  const orchestrator = new AgentOrchestrator(
    browserProvider,
    planner,
    repository,
    config,
    logger,
  );

  return {
    config,
    logger,
    safety,
    browserProvider,
    planner,
    repository,
    orchestrator,
    async shutdown() {
      await browserProvider.shutdown();
    },
  };
}
