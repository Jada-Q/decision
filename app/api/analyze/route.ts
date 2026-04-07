import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  const body = await request.json();
  const { current, newopt, context, scores, worst, regret, reversible } = body;

  const prompt = `你是一个理性、有同理心的决策顾问。用户正在做一个重要的人生决定，请基于以下信息给出结构化分析。

## 用户信息

**当前状态：** ${current}
**新选项：** ${newopt}
**个人背景：** ${context}

## 主观评分（1-10）
- 现状痛苦程度：${scores.pain}/10
- 新选项吸引力：${scores.attract}/10
- 感知风险：${scores.risk}/10
- 家庭/关系代价：${scores.family}/10
- 对自己能力的信心：${scores.conf}/10

## 关键问题回答
- **最坏情况：** ${worst}
- **80岁回头看会后悔吗：** ${regret}
- **决定是否可逆：** ${reversible}

## 请输出以下分析

### 1. 倾向判断
根据评分和回答，给出「走」或「留」的初步倾向，并解释为什么。

### 2. 核心矛盾
指出用户内心最大的矛盾点是什么。

### 3. 被忽略的因素
用户可能没有考虑到的 2-3 个重要因素。

### 4. 决策建议
给出具体的、可执行的下一步建议（不是"好好想想"这种空话）。

### 5. 最坏情况压力测试
如果最坏情况真的发生了，具体该怎么应对？

用中文回答。语气温和但直接，不要回避难听的真话。`;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
