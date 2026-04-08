"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type Scores = {
  pain: number;
  attract: number;
  risk: number;
  family: number;
  conf: number;
};

type FormData = {
  current: string;
  newopt: string;
  context: string;
  scores: Scores;
  worst: string;
  regret: string;
  reversible: string;
};

type HistoryEntry = {
  id: string;
  date: string;
  data: FormData;
  tendency: string;
  supporter: string;
  challenger: string;
};

const INITIAL_DATA: FormData = {
  current: "",
  newopt: "",
  context: "",
  scores: { pain: 5, attract: 5, risk: 5, family: 5, conf: 5 },
  worst: "",
  regret: "",
  reversible: "",
};

const SLIDER_LABELS: { key: keyof Scores; label: string }[] = [
  { key: "pain", label: "现在有多痛苦" },
  { key: "attract", label: "新选项的吸引力" },
  { key: "risk", label: "新选项的风险感" },
  { key: "family", label: "家庭/关系代价" },
  { key: "conf", label: "对自己能力的信心" },
];

const HISTORY_KEY = "decision-history";

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
}

function getTendency(scores: Scores): { label: string; description: string } {
  const goScore = scores.pain + scores.attract + scores.conf;
  const stayScore = scores.risk + scores.family;
  if (goScore > stayScore + 3) {
    return {
      label: "走",
      description:
        "基于你的评分，当前痛苦程度高、新选项吸引力强且你对自己有信心，倾向于尝试新选项。",
    };
  }
  if (stayScore > goScore - 3 && stayScore <= goScore + 3) {
    return {
      label: "纠结中",
      description:
        "基于你的评分，走和留的力量接近，需要更多信息来做判断。",
    };
  }
  return {
    label: "留",
    description:
      "基于你的评分，综合当前痛苦程度、新选项吸引力和个人信心。",
  };
}

function StepIndicator({ step }: { step: number }) {
  const labels = ["基本情况", "主观评分", "关键问题", "辩论分析"];
  return (
    <div className="flex items-center gap-2 mb-2">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className={`text-sm ${i === step ? "text-stone-900 font-medium" : "text-stone-400"}`}
          >
            {label}
          </span>
          {i < 3 && <span className="text-stone-300">→</span>}
        </div>
      ))}
    </div>
  );
}

async function streamRole(
  data: FormData,
  role: "supporter" | "challenger",
  onChunk: (text: string) => void,
  signal: AbortSignal
) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, role }),
    signal,
  });

  if (!res.ok || !res.body) {
    onChunk("分析请求失败，请稍后重试。");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
    onChunk(result);
  }
}

export default function DecisionPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [supporterText, setSupporterText] = useState("");
  const [challengerText, setChallengerText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [viewingEntry, setViewingEntry] = useState<HistoryEntry | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const updateScore = useCallback(
    (key: keyof Scores, value: number) => {
      setData((prev) => ({
        ...prev,
        scores: { ...prev.scores, [key]: value },
      }));
    },
    []
  );

  const saveToHistory = useCallback(
    (sText: string, cText: string) => {
      if (savedRef.current) return;
      savedRef.current = true;
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString("zh-CN"),
        data,
        tendency: getTendency(data.scores).label,
        supporter: sText,
        challenger: cText,
      };
      const updated = [entry, ...loadHistory()].slice(0, 20);
      saveHistory(updated);
      setHistory(updated);
    },
    [data]
  );

  const runAnalysis = async () => {
    setLoading(true);
    setSupporterText("");
    setChallengerText("");
    savedRef.current = false;
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    let finalSupporter = "";
    let finalChallenger = "";

    try {
      await Promise.all([
        streamRole(
          data,
          "supporter",
          (text) => {
            finalSupporter = text;
            setSupporterText(text);
          },
          signal
        ),
        streamRole(
          data,
          "challenger",
          (text) => {
            finalChallenger = text;
            setChallengerText(text);
          },
          signal
        ),
      ]);
      saveToHistory(finalSupporter, finalChallenger);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        if (!finalSupporter) setSupporterText("分析出错，请重试。");
        if (!finalChallenger) setChallengerText("分析出错，请重试。");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    } else if (step === 2) {
      setStep(3);
      runAnalysis();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setData(INITIAL_DATA);
    setSupporterText("");
    setChallengerText("");
    setStep(0);
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setViewingEntry(entry);
    setShowHistory(false);
  };

  const continueFromEntry = (entry: HistoryEntry) => {
    setData(entry.data);
    setSupporterText(entry.supporter);
    setChallengerText(entry.challenger);
    setViewingEntry(null);
    savedRef.current = true;
    setStep(3);
  };

  const buildClaudeUrl = () => {
    const prompt = `我正在做一个重要决定，想请你帮我深入分析。

当前状态：${data.current}
新选项：${data.newopt}
个人背景：${data.context}

主观评分（1-10）：
- 现状痛苦：${data.scores.pain}
- 新选项吸引力：${data.scores.attract}
- 风险感：${data.scores.risk}
- 家庭代价：${data.scores.family}
- 自信程度：${data.scores.conf}

最坏情况：${data.worst}
80岁回头看：${data.regret}
是否可逆：${data.reversible}

请帮我进一步分析这个决定。`;
    return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  };

  const tendency = getTendency(data.scores);

  // Viewing a history entry
  if (viewingEntry) {
    const t = getTendency(viewingEntry.data.scores);
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <button
            onClick={() => setViewingEntry(null)}
            className="text-sm text-stone-500 hover:text-stone-900 mb-4"
          >
            ← 返回历史
          </button>
          <h1 className="text-2xl font-bold mb-2">
            {viewingEntry.date} 的决策分析
          </h1>
          <p className="text-stone-600 mb-6">
            {viewingEntry.data.current} → {viewingEntry.data.newopt}
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <span className="font-bold">倾向：{t.label}</span>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">💪</span>
                <h3 className="font-bold text-emerald-900">支持者</h3>
              </div>
              <div className="text-sm text-emerald-900 whitespace-pre-wrap leading-relaxed">
                {viewingEntry.supporter}
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔍</span>
                <h3 className="font-bold text-red-900">挑战者</h3>
              </div>
              <div className="text-sm text-red-900 whitespace-pre-wrap leading-relaxed">
                {viewingEntry.challenger}
              </div>
            </div>
          </div>

          <button
            onClick={() => continueFromEntry(viewingEntry)}
            className="px-6 py-2.5 border border-stone-900 rounded-lg text-stone-900 font-medium hover:bg-stone-900 hover:text-white transition-colors"
          >
            基于此重新分析
          </button>
        </div>
      </div>
    );
  }

  // History panel
  if (showHistory) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">历史决策</h1>
            <button
              onClick={() => setShowHistory(false)}
              className="text-sm text-stone-500 hover:text-stone-900"
            >
              ← 返回
            </button>
          </div>

          {history.length === 0 ? (
            <p className="text-stone-500">还没有历史记录。</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => loadFromHistory(entry)}
                  className="w-full text-left bg-white border border-stone-200 rounded-lg p-4 hover:border-stone-400 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-stone-500">{entry.date}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        entry.tendency === "走"
                          ? "bg-emerald-100 text-emerald-700"
                          : entry.tendency === "留"
                            ? "bg-stone-100 text-stone-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.tendency}
                    </span>
                  </div>
                  <div className="text-stone-900 font-medium truncate">
                    {entry.data.current}
                  </div>
                  <div className="text-sm text-stone-500 truncate">
                    → {entry.data.newopt}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className={`mx-auto px-6 py-12 ${step === 3 ? "max-w-4xl" : "max-w-2xl"}`}>
        <div className="flex items-center justify-between mb-4">
          <StepIndicator step={step} />
          {history.length > 0 && step === 0 && (
            <button
              onClick={() => setShowHistory(true)}
              className="text-sm text-stone-500 hover:text-stone-900 shrink-0"
            >
              历史记录 ({history.length})
            </button>
          )}
        </div>

        {/* Step 0: 基本情况 */}
        {step === 0 && (
          <div>
            <p className="text-sm text-stone-500 mb-1">第1步 · 基本情况</p>
            <h1 className="text-2xl font-bold mb-8">描述当前处境和新选项</h1>

            <label className="block text-sm text-stone-700 mb-2">
              现在的工作/状态（一句话）
            </label>
            <textarea
              className="w-full border border-stone-300 rounded-lg p-4 mb-6 bg-white text-stone-900 placeholder-stone-400 resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="例：芯片公司，被老板过度压榨，无成长空间，薪资一般"
              value={data.current}
              onChange={(e) => updateField("current", e.target.value)}
            />

            <label className="block text-sm text-stone-700 mb-2">
              新选项是什么（一句话）
            </label>
            <textarea
              className="w-full border border-stone-300 rounded-lg p-4 mb-6 bg-white text-stone-900 placeholder-stone-400 resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="例：去上海智元机器人，AI方向，薪资+40%，需要离开家人"
              value={data.newopt}
              onChange={(e) => updateField("newopt", e.target.value)}
            />

            <label className="block text-sm text-stone-700 mb-2">
              你/当事人的基本情况（年龄、家庭、专业背景）
            </label>
            <textarea
              className="w-full border border-stone-300 rounded-lg p-4 mb-6 bg-white text-stone-900 placeholder-stone-400 resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="例：38岁，妻子和女儿在杭州，芯片技术背景，喜欢AI"
              value={data.context}
              onChange={(e) => updateField("context", e.target.value)}
            />

            <div className="flex gap-3">
              <button
                onClick={handleNext}
                className="px-6 py-2.5 border border-stone-900 rounded-lg text-stone-900 font-medium hover:bg-stone-900 hover:text-white transition-colors"
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {/* Step 1: 主观评分 */}
        {step === 1 && (
          <div>
            <p className="text-sm text-stone-500 mb-1">第2步 · 主观评分</p>
            <h1 className="text-2xl font-bold mb-8">
              用直觉打分（不要想太多）
            </h1>

            <div className="space-y-6">
              {SLIDER_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="w-40 text-sm text-stone-700 shrink-0">
                    {label}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={data.scores[key]}
                    onChange={(e) => updateScore(key, Number(e.target.value))}
                    className="flex-1 accent-stone-700 h-2"
                  />
                  <span className="w-8 text-right font-medium text-stone-900">
                    {data.scores[key]}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={handleBack}
                className="px-6 py-2.5 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
              >
                ← 返回
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2.5 border border-stone-900 rounded-lg text-stone-900 font-medium hover:bg-stone-900 hover:text-white transition-colors"
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 关键问题 */}
        {step === 2 && (
          <div>
            <p className="text-sm text-stone-500 mb-1">第3步 · 关键问题</p>
            <h1 className="text-2xl font-bold mb-8">三个必须想清楚的问题</h1>

            <label className="block text-sm text-stone-700 mb-2">
              最坏情况是什么？能接受吗？
            </label>
            <textarea
              className="w-full border border-stone-300 rounded-lg p-4 mb-6 bg-white text-stone-900 placeholder-stone-400 resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="例：智元2年后倒闭，40岁重新找工作。能接受，因为经历本身有价值。"
              value={data.worst}
              onChange={(e) => updateField("worst", e.target.value)}
            />

            <label className="block text-sm text-stone-700 mb-2">
              如果80岁回头看，不去会后悔吗？
            </label>
            <textarea
              className="w-full border border-stone-300 rounded-lg p-4 mb-6 bg-white text-stone-900 placeholder-stone-400 resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="例：会后悔。因为一直在一个让我痛苦的地方，没有勇气改变。"
              value={data.regret}
              onChange={(e) => updateField("regret", e.target.value)}
            />

            <label className="block text-sm text-stone-700 mb-2">
              这个决定可逆吗？（如果不好，能回头吗）
            </label>
            <textarea
              className="w-full border border-stone-300 rounded-lg p-4 mb-6 bg-white text-stone-900 placeholder-stone-400 resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="例：基本可逆。芯片背景在市场上还有需求，最坏情况回杭州教书。"
              value={data.reversible}
              onChange={(e) => updateField("reversible", e.target.value)}
            />

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="px-6 py-2.5 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
              >
                ← 返回
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2.5 border border-stone-900 rounded-lg text-stone-900 font-medium hover:bg-stone-900 hover:text-white transition-colors"
              >
                生成分析 ↗
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 辩论分析 */}
        {step === 3 && (
          <div>
            <p className="text-sm text-stone-500 mb-1">分析结果</p>
            <h1 className="text-2xl font-bold mb-6">双视角辩论</h1>

            {/* Score cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-stone-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-stone-900">
                  {data.scores.pain}
                </div>
                <div className="text-sm text-stone-600 mt-1">现状痛苦</div>
              </div>
              <div className="bg-stone-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-stone-900">
                  {data.scores.attract}
                </div>
                <div className="text-sm text-stone-600 mt-1">新选项吸引力</div>
              </div>
              <div className="bg-stone-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-stone-900">
                  {data.scores.risk}
                </div>
                <div className="text-sm text-stone-600 mt-1">感知风险</div>
              </div>
            </div>

            {/* Tendency */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="font-bold text-stone-900 mb-1">
                倾向：{tendency.label}
              </div>
              <div className="text-sm text-stone-700">
                {tendency.description}
              </div>
            </div>

            <hr className="border-stone-200 mb-6" />

            {/* Dual debate panels */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Supporter */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💪</span>
                  <h3 className="font-bold text-emerald-900">支持者</h3>
                  <span className="text-xs text-emerald-600">
                    帮你看到改变的价值
                  </span>
                </div>
                {loading && !supporterText && (
                  <div className="text-emerald-600 text-sm animate-pulse">
                    正在组织论点...
                  </div>
                )}
                {supporterText && (
                  <div className="text-sm text-emerald-900 whitespace-pre-wrap leading-relaxed">
                    {supporterText}
                  </div>
                )}
              </div>

              {/* Challenger */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🔍</span>
                  <h3 className="font-bold text-red-900">挑战者</h3>
                  <span className="text-xs text-red-600">
                    帮你看到隐藏的风险
                  </span>
                </div>
                {loading && !challengerText && (
                  <div className="text-red-600 text-sm animate-pulse">
                    正在组织论点...
                  </div>
                )}
                {challengerText && (
                  <div className="text-sm text-red-900 whitespace-pre-wrap leading-relaxed">
                    {challengerText}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleReset}
                className="px-6 py-2.5 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
              >
                重新开始
              </button>
              <a
                href={buildClaudeUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 border border-stone-900 rounded-lg text-stone-900 font-medium hover:bg-stone-900 hover:text-white transition-colors inline-flex items-center"
              >
                在对话中深入讨论 ↗
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-stone-200 text-sm text-stone-500 space-y-2">
          <p>
            四步流程：基本情况 → 主观评分（5个维度滑条）→ 三个关键问题 →
            AI双视角辩论分析。
          </p>
          <p>
            两个AI角色（支持者+挑战者）同时分析你的决策，帮你看到硬币的两面。
          </p>
        </div>
      </div>
    </div>
  );
}
