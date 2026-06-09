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

    // 后端可能返回 200 但缺 cloudaicompanionProject（账号未激活 / 不在服务范围 / 代理改写响应）
    // 此时给出可操作的中文错误提示，而不是把底层 zod / undefined 错误透给最终用户
    if (!parsed.cloudaicompanionProject) {
      const topLevelKeys =
        response && typeof response === "object"
          ? Object.keys(response as Record<string, unknown>).join(", ")
          : "(响应不是对象)";
      throw new Error(
        [
          "loadCodeAssist 响应缺少 cloudaicompanionProject 字段，无法确定 project_id。",
          `当前响应顶层字段: ${topLevelKeys}`,
          "可能原因:",
          "  1. 该 Google 账号尚未在 Antigravity IDE 中完成首次激活（请先在 IDE 内登录并创建项目，即使不写代码）",
          "  2. 当前账号不在 Antigravity 服务范围内（免费配额耗尽 / 地区限制）",
          "  3. 网络代理改写了响应内容",
          "可显式设置 ANTIBANANA_PROJECT_ID 环境变量跳过自动获取。",
        ].join("\n"),
      );
    }

    this.resolvedProjectId = parsed.cloudaicompanionProject;
    this.resolvedProjectIdSource = "loadCodeAssist.cloudaicompanionProject";
    return parsed.cloudaicompanionProject;
  }
}
