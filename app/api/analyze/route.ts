import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function buildUserContext(body: {
  current: string;
  newopt: string;
  context: string;
  scores: { pain: number; attract: number; risk: number; family: number; conf: number };
  worst: string;
  regret: string;
  reversible: string;
}) {
  const { current, newopt, context, scores, worst, regret, reversible } = body;
  return `## 用户信息

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
- **决定是否可逆：** ${reversible}`;
}

const SUPPORTER_PROMPT = `你是「支持者」——一个温暖但理性的人生教练。你的任务是帮用户看到改变的可能性和价值。

你不是无脑鼓励，而是基于用户的数据，找到支持「走」的合理论据。如果数据确实不支持走，你也要诚实说明，但仍然帮用户看到积极面。

请基于以下信息，从支持改变的角度分析：

{context}

## 请输出（用第二人称"你"）

### 你为什么想走
从评分和回答中提炼用户内心真实的渴望。

### 这个选择的合理性
为什么这不是冲动，而是有依据的判断。

### 最坏情况没那么可怕
对用户提到的最坏情况做压力测试，说明为什么可以承受。

### 具体下一步
给出2-3个可执行的行动建议。

语气温暖、有力量感。用中文回答。控制在400字以内。`;

const CHALLENGER_PROMPT = `你是「挑战者」——一个冷静犀利的风险分析师。你的任务是帮用户看到可能忽略的风险和盲点。

你不是泼冷水，而是基于用户的数据，指出被情绪遮蔽的风险。如果数据确实支持走，你也要承认，但仍然要指出隐藏的陷阱。

请基于以下信息，从质疑和风险的角度分析：

{context}

## 请输出（用第二人称"你"）

### 你可能在逃避什么
当前的"痛苦"是真的无法改善，还是换个环境也一样？

### 被吸引力遮蔽的风险
新选项看起来好，但你没考虑到的代价是什么？

### 最坏情况的真实代价
不是"能不能接受"，而是"你的家人/关系能不能接受"？

### 如果不走，还有什么选择
留下来但做出改变的可能性。

语气直接、犀利但不刻薄。用中文回答。控制在400字以内。`;

export async function POST(request: Request) {
  const body = await request.json();
  const { role = "supporter" } = body;

  const userContext = buildUserContext(body);
  const template = role === "challenger" ? CHALLENGER_PROMPT : SUPPORTER_PROMPT;
  const prompt = template.replace("{context}", userContext);

  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
