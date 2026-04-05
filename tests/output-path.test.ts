import assert from "node:assert/strict";
import test from "node:test";

import { resolveOutputPath } from "../src/output-path.ts";

test("Windows 下支持 ~/ 风格的 home 路径展开", () => {
  const resolved = resolveOutputPath("~/Desktop/cat.png", {
    platform: "win32",
    homeDir: "C:\\Users\\Alice",
    cwd: "C:\\workspace\\antibanana-mcp",
  });

  assert.equal(resolved, "C:\\Users\\Alice\\Desktop\\cat.png");
});

test("Windows 下支持 ~\\\\ 风格的 home 路径展开", () => {
  const resolved = resolveOutputPath("~\\Desktop\\cat.png", {
    platform: "win32",
    homeDir: "C:\\Users\\Alice",
    cwd: "C:\\workspace\\antibanana-mcp",
  });

  assert.equal(resolved, "C:\\Users\\Alice\\Desktop\\cat.png");
});

test("WSL 下会把 Windows 绝对路径转换成 /mnt 路径", () => {
  const resolved = resolveOutputPath("C:\\Users\\Alice\\Desktop\\cat.png", {
    platform: "linux",
    cwd: "/workspaces/antibanana-mcp",
    env: {
      WSL_DISTRO_NAME: "Ubuntu",
    } as NodeJS.ProcessEnv,
  });

  assert.equal(resolved, "/mnt/c/Users/Alice/Desktop/cat.png");
});

test("非 Windows 非 WSL 环境下拒绝直接使用 Windows 绝对路径", () => {
  assert.throws(
    () =>
      resolveOutputPath("C:\\Users\\Alice\\Desktop\\cat.png", {
        platform: "linux",
        cwd: "/workspaces/antibanana-mcp",
        env: {},
      }),
    /当前运行平台不是 Windows 或 WSL，无法直接访问 Windows 路径/,
  );
});
