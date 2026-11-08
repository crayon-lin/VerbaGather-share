# 内容种子数据规范

本目录存放站点的句子、作文、模板与精讲例句，全部为自撰内容（名著摘抄为公版作品原文）。
所有文件必须是 **UTF-8 无 BOM 的合法 JSON 数组**，字段名严格按下方定义，不要增删字段。

生成后自检：

```bash
node -e "const a=require('./文件.json'); console.log(a.length)"
```

---

## 1. 句子 `sentences-*.json`

```json
{
  "id": "s_w_001",
  "text_en": "It is no exaggeration to say that ...",
  "text_cn": "毫不夸张地说，……",
  "category": "writing",
  "subcategory": "opening",
  "level": "cet4",
  "source": "自撰",
  "author": "",
  "note": "亮点：It is no exaggeration to say that 引出观点，语气克制；可仿写：It is no exaggeration to say that ...",
  "tags": ["开头", "观点引入"],
  "difficulty": 2
}
```

- `category` 只能是：`writing`（写作句型）、`motivational`（励志）、`literature`（名著）、`exam`（四六级高频表达）。
- `subcategory` 对应：`opening` / `transition` / `argument` / `chart` / `ending` / `quote` / `classic` / `expression`。
- `level`：`cet4` / `cet6` / `all`；`difficulty`：1–3 的整数。
- `source`：自撰写“自撰”；名著写书名（英文）；名言写来源或“佚名”。
- `author`：作者名，没有就写空字符串。
- `note`：一句中文讲解，指出亮点句型/词汇 + 一个可仿写点，30–80 字。
- `tags`：1–3 个中文短标签。
- 英文句子 10–40 词，必须语法正确、地道；中文译文自然，不逐字硬译。

## 2. 作文 `essays-*.json`

```json
{
  "id": "e_4a_1",
  "title_en": "The Value of Lifelong Learning",
  "title_cn": "终身学习的价值",
  "prompt_cn": "Directions: For this part, you are allowed 30 minutes to write an essay on the value of lifelong learning. You should write at least 120 words but no more than 180 words.",
  "prompt_en": "Write an essay on the value of lifelong learning (120–180 words).",
  "type": "argument",
  "level": "cet4",
  "word_count": 168,
  "paragraphs": [
    {
      "en": "In an age when knowledge is updated ...",
      "cn": "在知识不断更新的时代，……",
      "role": "开头段：背景 + 观点"
    }
  ],
  "outline": [
    { "part": "开头段", "points": ["用现象引入", "亮明中心论点"] }
  ],
  "highlights": [
    { "text": "In an age when ...", "type": "句型", "note": "when 引导定语从句，交代背景" }
  ],
  "tips": ["字数控制在 120–180 词", "三个段落，每段一个中心"]
}
```

- `type` 只能是：`argument`（议论文）、`chart`（图表）、`letter`（书信）、`speech`（演讲）、`notice`（通知）、`review`（评论）。
- 四级 `word_count` 120–180，六级 150–220，且与 `paragraphs` 中英文实际词数误差 ≤ 5 词。
- `paragraphs` 3–4 段，每段 `en` 60–90 词，`cn` 为对应人工译文。
- `outline` 3–4 项；`highlights` 4–6 条（text 必须是范文里真实出现的片段）；`tips` 2–4 条。
- `prompt_cn` 用四六级真题风格，100–180 字；`prompt_en` 一句话即可。

## 3. 作文模板 `templates.json`

```json
{
  "id": "t_001",
  "text_en": "Nowadays, ... has aroused wide public concern.",
  "text_cn": "如今，……已引起公众的广泛关注。",
  "type": "argument",
  "usage": "开头",
  "level": "cet4",
  "tags": ["现象引入"]
}
```

- `usage` 只能是：`开头` / `过渡` / `论证` / `举例` / `结尾`。
- `text_en` 用 `...` 表示可替换内容，10–30 词。
- 40 条，覆盖 argument / chart / letter / speech / notice / review 六类，每类至少 5 条。

## 4. 精讲例句 `examples-*.json`

每个文件对应 `core-terms-XX.json` 中的 50 个词，**顺序一致、一词一条，不得遗漏**：

```json
{
  "term": "abandon",
  "example_en": "He refused to abandon his dream even after repeated failures.",
  "example_cn": "即使屡遭失败，他也拒绝放弃自己的梦想。",
  "note": "abandon a plan / an idea；比 give up 更正式"
}
```

- `example_en` 8–18 词，必须包含该词（允许 -s/-ed/-ing 等词形变化），语境适合四六级写作或阅读。
- 不要用生僻词解释生僻词；句子要能独立看懂。
- `example_cn` 为自然中文翻译；`note` 20–60 字，讲搭配或用法。

## 5. 数量与质量红线

- 不许出现重复的英文句子 / 重复的作文题目 / 重复的模板。
- 不许编造名人名言；不确定作者时写“佚名”。
- 名著必须选用公版经典（奥斯汀、勃朗特、狄更斯、梭罗、王尔德、雪莱、莎士比亚等），引文尽量准确。
- 所有中文用简体，标点用全角；英文用直引号，不用弯引号。
- 不要出现“作为 AI”“本文由”等字样。
