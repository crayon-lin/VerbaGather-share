#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从 ECDICT CSV 生成站点种子数据（开发期脚本，运行结果已随项目提供）。

用法:
    python scripts/build-seed.py --csv D:\\path\\to\\ecdict.csv

产物:
    server/seed/words.json        四六级词库（约 5805 词）
    server/seed/dict.json         本地查词词典（约 4.5 万词）
    server/seed/core-terms-*.json 400 个精讲核心词，供生成例句
    server/seed/stats.json        数据统计
"""
import argparse
import csv
import hashlib
import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "server", "seed")

POS_RE = re.compile(r"^([a-z]{1,4}\.)")
DOMAIN_RE = re.compile(r"^\[[^\]]+\]")


def norm_phonetic(raw: str) -> str:
    if not raw:
        return ""
    p = raw.strip().strip("/").strip('"')
    p = p.replace("ә", "ə")
    p = p.replace("'", "ˈ").replace(",", "ˌ").replace(".", "ˌ")
    p = p.replace(":", "ː")
    p = re.sub(r"\s+", "", p)
    # 复合元音
    p = p.replace("ai", "aɪ").replace("ei", "eɪ").replace("ɔi", "ɔɪ")
    p = p.replace("au", "aʊ").replace("əu", "əʊ")
    # 短元音（保留词尾 happy vowel 与长音 iː / uː）
    p = re.sub(r"i(?!ː)(?=.)", "ɪ", p)
    p = re.sub(r"u(?!ː)(?=.)", "ʊ", p)
    return f"/{p}/" if p else ""


def clean_translation(raw: str, max_lines: int = 4) -> str:
    text = (raw or "").replace("\\n", "\n")
    lines = []
    for line in text.split("\n"):
        line = line.strip().strip(";；,， ")
        if not line:
            continue
        if DOMAIN_RE.match(line):
            # 丢弃 [网络] [医] [计] 等领域噪声
            continue
        line = re.sub(r"^\[[^\]]+\]\s*", "", line)
        line = line.replace("...", "…")
        line = re.sub(r",\s*(?=[\u4e00-\u9fff])", "；", line)
        if line and line not in lines:
            lines.append(line)
    if not lines:
        lines = [l.strip() for l in text.split("\n") if l.strip()][:1]
    return "\n".join(lines[:max_lines])


def extract_pos(meaning: str) -> str:
    seen = []
    for line in meaning.split("\n"):
        m = POS_RE.match(line.strip())
        if m and m.group(1) not in seen:
            seen.append(m.group(1))
    return " / ".join(seen[:4])


def clean_definition(raw: str, limit: int = 220) -> str:
    text = (raw or "").replace("\\n", "\n")
    lines = [re.sub(r"^[a-z]{1,2}\.\s*", "", l.strip()) for l in text.split("\n") if l.strip()]
    out = "; ".join(lines[:2])
    if len(out) > limit:
        out = out[: limit - 1].rsplit(" ", 1)[0] + "…"
    return out


EXCHANGE_LABELS = {
    "p": "过去式",
    "d": "过去分词",
    "i": "现在分词",
    "3": "第三人称单数",
    "s": "复数",
    "r": "比较级",
    "t": "最高级",
    "0": "原型",
    "1": "原型变化",
}


def humanize_exchange(raw: str) -> str:
    if not raw:
        return ""
    parts = []
    for chunk in raw.split("/"):
        if ":" not in chunk:
            continue
        code, value = chunk.split(":", 1)
        label = EXCHANGE_LABELS.get(code)
        value = value.strip()
        if label and value and len(value) < 60:
            parts.append(f"{label} {value}")
    return " · ".join(parts[:6])


def to_int(v):
    try:
        n = int(str(v).strip())
        return n if n > 0 else 0
    except Exception:
        return 0


def raw_rank(frq: int, bnc: int) -> int:
    ranks = [r for r in (frq, bnc) if r > 0]
    return min(ranks) if ranks else 200000


def content_word(pos: str) -> bool:
    tokens = [t.strip() for t in pos.replace("/", " ").split() if t.strip()]
    bad = {"num.", "pron.", "prep.", "conj.", "art.", "aux.", "int.", "abbr."}
    if any(t in bad for t in tokens):
        return False
    return any(t in {"n.", "v.", "vt.", "vi.", "a.", "ad.", "adv."} for t in tokens)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--dict-limit", type=int, default=45000)
    args = ap.parse_args()

    os.makedirs(SEED, exist_ok=True)
    words = []
    all_common = []
    tags_counter = Counter()
    level_counts = Counter()

    with open(args.csv, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            term = (row.get("word") or "").strip()
            if not term:
                continue
            tags = (row.get("tag") or "").split()
            frq = to_int(row.get("frq"))
            bnc = to_int(row.get("bnc"))
            collins = to_int(row.get("collins"))
            oxford = 1 if (row.get("oxford") or "").strip() else 0
            trans = clean_translation(row.get("translation") or "")
            phon = norm_phonetic(row.get("phonetic") or "")
            rank = raw_rank(frq, bnc)

            is_cet = "cet4" in tags or "cet6" in tags
            is_common = collins > 0 or oxford or frq > 0 or bnc > 0
            if is_common:
                all_common.append(
                    {
                        "term": term,
                        "phonetic": phon,
                        "translation": trans.replace("\n", "；")[:180],
                        "pos": extract_pos(trans),
                        "rank": rank,
                    }
                )

            if not is_cet:
                continue
            if not re.fullmatch(r"[A-Za-z][A-Za-z' -]{0,40}", term):
                continue
            if len(term) > 32 or term[0].isupper():
                continue

            wid = "w_" + hashlib.sha1(term.lower().encode("utf-8")).hexdigest()[:12]
            levels = []
            if "cet4" in tags:
                levels.append("cet4")
            if "cet6" in tags:
                levels.append("cet6")
            word = {
                "id": wid,
                "term": term,
                "phonetic": phon,
                "pos": extract_pos(trans),
                "meaning_cn": trans,
                "meaning_en": clean_definition(row.get("definition") or ""),
                "exchange": humanize_exchange(row.get("exchange") or ""),
                "tags": [t for t in tags if t in ("cet4", "cet6", "gk", "ky", "toefl", "ielts", "gre")],
                "levels": levels,
                "rank": rank,
                "collins": collins,
                "oxford": oxford,
                "example_en": "",
                "example_cn": "",
                "is_core": 0,
                "source": "ECDICT",
            }
            words.append(word)
            for t in tags:
                tags_counter[t] += 1
            level_counts[levels[0] if levels else "?"] += 1

    # 去重（同词不同大小写）
    seen = {}
    for w in words:
        key = w["term"].lower()
        if key not in seen or w["rank"] < seen[key]["rank"]:
            seen[key] = w
    words = sorted(seen.values(), key=lambda w: (w["rank"], w["term"].lower()))
    print(f"words: {len(words)} (cet4={level_counts['cet4']}, cet6-only={len(words) - level_counts['cet4']})")

    # 精讲核心词：前 200 个四级 + 前 200 个六级新增
    STOP = {
        "people", "thing", "something", "anything", "nothing", "someone",
        "everyone", "always", "never", "often", "really", "quite", "rather",
        "little", "much", "many", "more", "most", "other", "another", "such",
        "about", "above", "after", "again", "against", "before", "below",
        "between", "during", "through", "under", "until", "while", "where",
        "which", "whose", "there", "their", "these", "those", "would", "could",
        "should", "might", "shall", "will", "been", "being", "have", "does",
    }

    def pick(pool, n):
        scored = []
        for w in pool:
            if not (5 <= len(w["term"]) <= 14):
                continue
            if not re.fullmatch(r"[a-z]+", w["term"]):
                continue
            if w["term"] in STOP:
                continue
            if not w["meaning_cn"] or not content_word(w["pos"]):
                continue
            if not (300 <= w["rank"] <= 16000):
                continue
            score = w["rank"] - w["collins"] * 350 - w["oxford"] * 550
            scored.append((score, w))
        scored.sort(key=lambda x: (x[0], x[1]["term"]))
        return [w for _, w in scored[:n]]

    cet4_pool = [w for w in words if w["levels"] and w["levels"][0] == "cet4"]
    cet6_pool = [w for w in words if w["levels"] and w["levels"][0] == "cet6"]
    core = pick(cet4_pool, 200) + pick(cet6_pool, 200)
    core_terms = []
    for i, w in enumerate(core):
        w["is_core"] = 1
        core_terms.append(
            {
                "term": w["term"],
                "level": w["levels"][0],
                "phonetic": w["phonetic"],
                "pos": w["pos"],
                "meaning_cn": w["meaning_cn"].split("\n")[0],
            }
        )
    print(f"core terms: {len(core_terms)}")

    # 词典：全部四六级 + 高频常用词，取 importance 最高的 N 个
    common_seen = {}
    for d in all_common:
        key = d["term"].lower()
        if key not in common_seen or d["rank"] < common_seen[key]["rank"]:
            common_seen[key] = d
    cet_keys = {w["term"].lower() for w in words}
    dict_entries = sorted(common_seen.values(), key=lambda d: d["rank"])
    selected = []
    picked_keys = set()
    for d in dict_entries:
        key = d["term"].lower()
        if d["rank"] <= 9000 or key in cet_keys or len(selected) < args.dict_limit:
            if key in picked_keys:
                continue
            picked_keys.add(key)
            selected.append(d)
        if len(selected) >= args.dict_limit and all(k in picked_keys for k in cet_keys):
            break
    # 保证所有四六级词在词典中
    for key in cet_keys:
        if key not in picked_keys:
            w = next((x for x in words if x["term"].lower() == key), None)
            if w:
                selected.append(
                    {
                        "term": w["term"],
                        "phonetic": w["phonetic"],
                        "translation": w["meaning_cn"].replace("\n", "；")[:180],
                        "pos": w["pos"],
                        "rank": w["rank"],
                    }
                )
                picked_keys.add(key)
    print(f"dict: {len(selected)}")

    def dump(name, data):
        path = os.path.join(SEED, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {name}: {os.path.getsize(path) / 1024 / 1024:.2f} MB")

    dump("words.json", words)
    dump("dict.json", selected)
    dump(
        "stats.json",
        {
            "words": len(words),
            "cet4": sum(1 for w in words if "cet4" in w["levels"]),
            "cet6Only": sum(1 for w in words if w["levels"] == ["cet6"]),
            "core": len(core_terms),
            "dict": len(selected),
            "tags": dict(tags_counter),
        },
    )

    # 精讲词分 8 批，每批 50 个
    os.makedirs(os.path.join(SEED, "content"), exist_ok=True)
    for i in range(0, len(core_terms), 50):
        batch = core_terms[i : i + 50]
        dump(os.path.join("content", f"core-terms-{i // 50 + 1:02d}.json"), batch)

    print("done")


if __name__ == "__main__":
    main()
