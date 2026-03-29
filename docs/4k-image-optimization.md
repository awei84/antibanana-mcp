# 4K 图片优化方案分析

## 问题背景

来源：[LINUX DO 社区帖子](https://linux.do/t/topic/1585174)

Antigravity 反代 Banana 生图时，**图片+语言**模式（`responseModalities: ["IMAGE", "TEXT"]`）据报会在同一个 response 里返回**两张图**：

- 第一张：**缩略图**（小尺寸，约 706×694）
- 第二张：**4K 高清图**（真正的目标产物）

---

## 实测结果（2026-03-29）

使用当前 antibanana-mcp 对 `gemini-3.1-flash-image` 进行了两次文生图测试：

| 测试 | prompt | imageCount | partIndex |
|------|--------|-----------|-----------|
| 1 | a simple red apple on white background | **1** | 0 |
| 2 | a cat sitting on a wooden table, photorealistic | **1** | 0 |

**结论：当前文生图（text-to-image）模式下，后端只返回 1 张图，不存在缩略图+高清图同时返回的问题。**

### 根因分析

LINUX DO 帖子描述的场景是 **"banana 的图+语言生图"**，即**图像编辑模式**（上传图片作为输入 + 文字 prompt）。推测缩略图是后端把输入图或中间预览图一并塞入 response parts 导致的。

当前 antibanana-mcp **只支持文生图**，没有图片输入，所以这个路径目前不会触发该问题。

---

## 现状代码分析

### 图片收集逻辑（`index.ts:216-229`）

```ts
result.response.candidates.forEach((candidate, candidateIndex) => {
  candidate.content.parts.forEach((part, partIndex) => {
    if (!part.inlineData) return;
    images.push({ candidateIndex, partIndex, mimeType, data });
  });
});
```

所有 inlineData 都进了 `images` 数组，顺序由后端返回顺序决定。**没有任何分辨率过滤或排序**——这是正确的现状，暂无问题。

---

## 后续图片编辑功能的注意事项

若将来支持图像编辑（用户上传图片），大概率会触发多图返回问题，届时需要考虑过滤策略。

### 方案 A：按 base64 体积排序，保留最大的一张

**原理**：4K 图的 base64 字符串远大于缩略图，无需解码即可比较。

```ts
// 按 data 长度降序，取第一张（最大 = 最高清）
const largest = images.sort((a, b) => b.data.length - a.data.length)[0];
```

**优点**：纯字符串操作，无额外依赖，Node.js 环境直接可用。
**缺点**：间接推断，理论上存在误判（见坑点 1）。

---

### 方案 B：解码 base64 → 解析图片尺寸，按像素数排序

**原理**：读取 PNG/JPEG 文件头中的宽高字段，精确比较。

```ts
// PNG: width 在字节 16-19，height 在字节 20-23
const buf = Buffer.from(data, "base64");
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
const pixels = width * height;
```

**优点**：结果精确可靠。
**缺点**：需要对每张图解码，4K 图 base64 体积可能达 10MB+，内存压力大；需区分 PNG/JPEG（文件头结构不同）。

---

### 方案 C：加环境变量开关

```
ANTIBANANA_IMAGE_FILTER=largest  # 只返回最大图
ANTIBANANA_IMAGE_FILTER=all      # 全部返回（当前行为，默认）
```

---

## 坑点清单（供将来参考）

### 坑点 1：base64 长度 ≠ 分辨率大小（方案 A 的风险）

JPEG 使用有损压缩，极端情况下高压缩 4K 图体积可能小于低压缩缩略图。
→ **实际风险低**，缩略图（706×694）vs 4K 图（3840×2160）体积差距通常在 10x 以上。

### 坑点 2：后端行为可能随版本变化

如果 Antigravity 后端某次更新改变了返回图片数量或顺序，现有逻辑会静默受影响，难以察觉。
→ 建议在 structuredContent 里保留 `imageCount`（已有）方便排查。

### 坑点 3：过滤粒度应按 candidate 维度，不是全局

若将来有多 candidate 返回（每个 candidate 生成一张图），全局只留最大会丢图。
→ 应该是：**每个 candidate 内保留最大图，再把各 candidate 的最大图合并返回**。

### 坑点 4：text part 顺序不固定

parts 可能是 `[text, image_thumb, image_4k]` 或 `[image_thumb, text, image_4k]`。
过滤时只应对 `inlineData` 操作，text parts 不参与排序（当前代码已正确处理）。

### 坑点 5：MCP stdio 传输体积

4K JPEG base64 编码后约 **10-30MB**，通过 stdio 传输给客户端属正常现象，不是 bug。
但如果将来同时返回多张 4K 图，体积会成倍增加，需注意超时配置（默认 `ANTIBANANA_TIMEOUT_MS = 120_000`）。

### 坑点 6：过滤后 structuredContent 必须同步更新

`structuredContent.images` 记录了每张图的 `candidateIndex` / `partIndex`。
如果只返回最大图的 content 但 structuredContent 仍列出所有图，会造成数据不一致。
→ **两处必须同步修改。**

---

## 当前结论

| 问题 | 状态 |
|------|------|
| 文生图返回缩略图 | **不存在**，测试确认只返回 1 张图 |
| 图片编辑返回缩略图 | **未测试**，功能暂未实现，留待将来处理 |
| 代码现状 | 正确，无需修改 |
