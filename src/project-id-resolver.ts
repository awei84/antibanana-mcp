import {
  loadCodeAssistResponseSchema,
  type LoadCodeAssistResponse,
} from "./types.js";

export type ProjectIdSource =
  | "env.ANTIBANANA_PROJECT_ID"
  | "credential.project_id"
  | "credential.project"
  | "loadCodeAssist.cloudaicompanionProject";

type PostJson = (pathname: string, body: unknown) => Promise<unknown>;

export class ProjectIdResolver {
  private readonly postJson: PostJson;
  private resolvedProjectId?: string;
  private resolvedProjectIdSource?: ProjectIdSource;
  private inFlight?: Promise<string>;

  constructor(options: {
    postJson: PostJson;
    initialProjectId?: string;
    initialProjectIdSource?: Exclude<
      ProjectIdSource,
      "loadCodeAssist.cloudaicompanionProject"
    >;
  }) {
    this.postJson = options.postJson;
    this.resolvedProjectId = options.initialProjectId;
    this.resolvedProjectIdSource = options.initialProjectIdSource;
  }

  async getProjectId(): Promise<string> {
    if (this.resolvedProjectId) {
      return this.resolvedProjectId;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.loadProjectId();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  getProjectIdSource(): ProjectIdSource | undefined {
    return this.resolvedProjectIdSource;
  }

  private async loadProjectId(): Promise<string> {
    const response = await this.postJson("/v1internal:loadCodeAssist", {
      metadata: {
        ideType: "ANTIGRAVITY",
      },
    });

    const parsed = loadCodeAssistResponseSchema.parse(
      response,
    ) as LoadCodeAssistResponse;
    this.resolvedProjectId = parsed.cloudaicompanionProject;
    this.resolvedProjectIdSource = "loadCodeAssist.cloudaicompanionProject";
    return parsed.cloudaicompanionProject;
  }
}
