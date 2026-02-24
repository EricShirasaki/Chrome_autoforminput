/**
 * GForm AutoFill v1.1.0 - Content Script
 * OpenAI API（gpt-4.1-nano）によるLLMベースのラベル判定で
 * あらゆる表記ゆれに対応した自動入力を実現する
 */

// ============================================================
// 定数定義
// ============================================================

/** LLMが返すフィールドキーの一覧（プロフィールのキーと1対1対応） */
const FIELD_KEYS = [
  "lastName",       // 姓
  "firstName",      // 名
  "fullName",       // 氏名（フルネーム）
  "lastNameKana",   // 姓（フリガナ）
  "firstNameKana",  // 名（フリガナ）
  "fullNameKana",   // 氏名（フリガナ・フルネーム）
  "phone",          // 電話番号
  "email",          // メールアドレス
  "postalCode",     // 郵便番号
  "prefecture",     // 都道府県
  "city",           // 市区町村
  "addressLine",    // 番地・建物名
  "fullAddress",    // 住所（全体）
  "organization",   // 所属・会社名・学校名
  "department",     // 部署・学部・学科
  "age",            // 年齢
  "birthday",       // 生年月日
  "gender",         // 性別
  "unknown"         // 上記のいずれにも該当しない
];

/** LLMへのシステムプロンプト */
const SYSTEM_PROMPT = `あなたはGoogleフォームの入力欄ラベルを分類するアシスタントです。
与えられたラベルテキストのリストを読み、それぞれが以下のフィールドキーのどれに対応するかを判定してください。

フィールドキーの定義:
- lastName: 姓・苗字・名字（姓のみ）
- firstName: 名・名前（名のみ）
- fullName: 氏名・フルネーム・姓名（姓と名が一体になったもの）
- lastNameKana: 姓のフリガナ・読み（カタカナまたはひらがな、姓のみ）
- firstNameKana: 名のフリガナ・読み（カタカナまたはひらがな、名のみ）
- fullNameKana: 氏名全体のフリガナ・読み（姓名一体）
- phone: 電話番号・携帯番号・TEL・連絡先（電話）
- email: メールアドレス・Eメール
- postalCode: 郵便番号・〒
- prefecture: 都道府県
- city: 市区町村・市町村
- addressLine: 番地・建物名・ビル名・マンション名・号室（住所の詳細部分）
- fullAddress: 住所全体（都道府県から番地まで含む一行住所）
- organization: 所属・会社名・勤務先・学校名・大学名・団体名
- department: 部署・学部・学科・専攻・学年
- age: 年齢
- birthday: 生年月日・誕生日
- gender: 性別
- unknown: 上記のいずれにも該当しない（参加予定イベント、アンケート項目など）

判定の最重要ルール（必ず守ること）:
1. ラベルの中に「姓」という文字が含まれていれば、それは lastName（姓のみ）である。「お名前（姓）」「【氏名】姓」「姓（苗字）」はすべて lastName。
2. ラベルの中に「名」という文字が含まれていれば、それは firstName（名のみ）である。「お名前（名）」「【氏名】名」「名（名前）」はすべて firstName。
3. 「姓名」という表現はフルネーム（姓と名が一体）を意味するため fullName である。「お名前（姓名）」「氏名（姓名）」はすべて fullName。
4. 「お名前」単独（姓・名・姓名などの補足がない）の場合は fullName とする。
5. ラベルに【氏名】【住所】【フリガナ】などのカテゴリプレフィックスが付いていても、後半のキーワードで判定する。
6. 「セイ」「メイ」のようなカタカナ表記も姓・名として認識する（「フリガナ（セイ）」→ lastNameKana、「フリガナ（メイ）」→ firstNameKana）。
7. 確信が持てない場合は "unknown" を返す。

必ずJSON形式で回答してください。キーはラベルのインデックス（0始まり）、値はフィールドキー文字列です。
例: {"0": "lastName", "1": "firstName", "2": "unknown"}`;

// ============================================================
// ユーティリティ関数
// ============================================================

/**
 * テキストを正規化（全角→半角、余分な空白除去）
 */
function normalizeText(text) {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ")
    .trim();
}

/**
 * フルネームを姓名に分割する（スペース区切り）
 */
function splitFullName(fullName) {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2) {
    return { last: parts[0], first: parts.slice(1).join(" ") };
  }
  return { last: trimmed, first: "" };
}

/**
 * フィールドキーとプロフィールから入力値を解決する
 */
function resolveValue(fieldKey, profile) {
  switch (fieldKey) {
    case "lastName":
      if (profile.lastName) return profile.lastName;
      if (profile.fullName) return splitFullName(profile.fullName).last;
      return null;
    case "firstName":
      if (profile.firstName) return profile.firstName;
      if (profile.fullName) return splitFullName(profile.fullName).first;
      return null;
    case "fullName":
      if (profile.fullName) return profile.fullName;
      if (profile.lastName && profile.firstName) return `${profile.lastName} ${profile.firstName}`;
      return null;
    case "lastNameKana":
      if (profile.lastNameKana) return profile.lastNameKana;
      if (profile.fullNameKana) return splitFullName(profile.fullNameKana).last;
      return null;
    case "firstNameKana":
      if (profile.firstNameKana) return profile.firstNameKana;
      if (profile.fullNameKana) return splitFullName(profile.fullNameKana).first;
      return null;
    case "fullNameKana":
      if (profile.fullNameKana) return profile.fullNameKana;
      if (profile.lastNameKana && profile.firstNameKana) return `${profile.lastNameKana} ${profile.firstNameKana}`;
      return null;
    case "phone":
      return profile.phone || null;
    case "email":
      return profile.email || null;
    case "postalCode":
      return profile.postalCode || null;
    case "prefecture":
      return profile.prefecture || null;
    case "city":
      return profile.city || null;
    case "addressLine":
      return profile.addressLine || null;
    case "fullAddress": {
      if (profile.fullAddress) return profile.fullAddress;
      const parts = [
        profile.postalCode ? `〒${profile.postalCode}` : "",
        profile.prefecture || "",
        profile.city || "",
        profile.addressLine || ""
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "organization":
      return profile.organization || null;
    case "department":
      return profile.department || null;
    case "age":
      return profile.age || null;
    case "birthday":
      return profile.birthday || null;
    case "gender":
      return profile.gender || null;
    default:
      return null;
  }
}

// ============================================================
// Googleフォーム DOM 操作
// ============================================================

/**
 * Googleフォームの全質問ブロックを取得する
 */
function getQuestionBlocks() {
  const selectors = [
    ".Qr7Oae",
    ".freebirdFormviewerViewItemsItemItem",
    "[data-params]",
    "[role='listitem']"
  ];
  for (const sel of selectors) {
    const blocks = document.querySelectorAll(sel);
    if (blocks.length > 0) return Array.from(blocks);
  }
  return [];
}

/**
 * 質問ブロックからラベルテキストを抽出する
 */
function extractLabelText(block) {
  const labelSelectors = [
    ".freebirdFormviewerViewItemsItemItemTitle",
    ".M7eMe",
    "[role='heading']",
    ".freebirdFormviewerComponentsQuestionBaseTitle"
  ];
  for (const sel of labelSelectors) {
    const el = block.querySelector(sel);
    if (el && el.textContent.trim()) {
      return normalizeText(el.textContent.trim());
    }
  }
  return "";
}

/**
 * 質問ブロック内のテキスト入力要素を取得する（テキスト入力のみ対象）
 */
function getTextInputElement(block) {
  const inputSelectors = [
    "input[type='text']",
    "input[type='email']",
    "input[type='tel']",
    "input[type='number']",
    "textarea",
    "input:not([type='radio']):not([type='checkbox']):not([type='hidden']):not([type='submit'])"
  ];
  for (const sel of inputSelectors) {
    const el = block.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * React/Angular管理下のinput要素に値をセットし、各種イベントを発火する
 */
function setNativeValue(element, value) {
  const proto = element.tagName === "TEXTAREA"
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  ["input", "change", "keyup", "blur"].forEach(type => {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

/**
 * 入力されたフィールドを一時的にハイライトする
 */
function highlightField(inputEl) {
  const orig = inputEl.style.backgroundColor;
  inputEl.style.transition = "background-color 0.3s ease";
  inputEl.style.backgroundColor = "#d4edda";
  setTimeout(() => {
    inputEl.style.backgroundColor = orig;
  }, 1500);
}

// ============================================================
// OpenAI API 呼び出し
// ============================================================

/**
 * ラベルリストをOpenAI APIに送り、フィールドキーのマッピングを取得する
 * @param {string[]} labels - フォームのラベルテキスト一覧
 * @param {string} apiKey - OpenAI APIキー
 * @returns {Promise<Object>} - { "0": "lastName", "1": "phone", ... }
 */
async function classifyLabelsWithLLM(labels, apiKey) {
  // ラベルが0件の場合はスキップ
  if (labels.length === 0) return {};

  const userMessage = labels
    .map((label, i) => `${i}: "${label}"`)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage }
      ],
      temperature: 0,          // 決定論的な出力（ランダム性なし）
      max_tokens: 300,          // 出力は短いJSONのみ
      response_format: { type: "json_object" }  // JSON出力を強制
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API エラー: ${response.status} ${err?.error?.message || ""}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("APIからの応答が空です");

  return JSON.parse(content);
}

// ============================================================
// メイン自動入力処理
// ============================================================

/**
 * LLMを使ってGoogleフォームを自動入力する
 */
async function autoFillForm() {
  // ストレージからプロフィールとAPIキーを取得
  const result = await chrome.storage.sync.get(["profile", "openaiApiKey"]);
  const profile = result.profile;
  const apiKey  = result.openaiApiKey;

  if (!profile) {
    showToast("プロフィールが未登録です。拡張機能アイコンから設定してください。", "warning");
    return;
  }
  if (!apiKey) {
    showToast("OpenAI APIキーが未設定です。設定画面から登録してください。", "warning");
    return;
  }

  // テキスト入力欄を持つ質問ブロックのみを収集
  const blocks = getQuestionBlocks();
  const targetBlocks = [];
  const labels = [];

  for (const block of blocks) {
    const label = extractLabelText(block);
    const inputEl = getTextInputElement(block);
    if (label && inputEl) {
      targetBlocks.push({ block, inputEl, label });
      labels.push(label);
    }
  }

  if (labels.length === 0) {
    showToast("入力できるテキスト欄が見つかりませんでした。", "info");
    return;
  }

  // ローディング表示
  showToast(`${labels.length}件のラベルをAIで解析中...`, "info");

  // LLMでラベルを一括分類
  let mapping;
  try {
    mapping = await classifyLabelsWithLLM(labels, apiKey);
  } catch (err) {
    console.error("[GForm AutoFill] LLM分類エラー:", err);
    showToast(`AI解析エラー: ${err.message}`, "error");
    return;
  }

  // 分類結果に基づいて入力
  let filledCount = 0;
  for (let i = 0; i < targetBlocks.length; i++) {
    const fieldKey = mapping[String(i)];
    if (!fieldKey || fieldKey === "unknown") continue;

    const value = resolveValue(fieldKey, profile);
    if (!value) continue;

    setNativeValue(targetBlocks[i].inputEl, value);
    highlightField(targetBlocks[i].inputEl);
    filledCount++;
  }

  if (filledCount > 0) {
    showToast(`${filledCount}件の項目を自動入力しました。`, "success");
  } else {
    showToast("プロフィールに登録された情報と一致する項目が見つかりませんでした。", "info");
  }
}

// ============================================================
// UI フィードバック（トースト通知）
// ============================================================

function showToast(message, type = "info") {
  const existing = document.getElementById("gform-autofill-toast");
  if (existing) existing.remove();

  const colors = {
    success: { bg: "#28a745", border: "#1e7e34" },
    warning: { bg: "#ffc107", border: "#e0a800" },
    info:    { bg: "#17a2b8", border: "#117a8b" },
    error:   { bg: "#dc3545", border: "#bd2130" }
  };
  const color = colors[type] || colors.info;

  const toast = document.createElement("div");
  toast.id = "gform-autofill-toast";
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    background: ${color.bg};
    border: 1px solid ${color.border};
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif;
    max-width: 380px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    line-height: 1.5;
    cursor: pointer;
    transition: opacity 0.4s ease;
    opacity: 1;
  `;
  toast.textContent = `✦ GForm AutoFill: ${message}`;
  toast.addEventListener("click", () => toast.remove());
  document.body.appendChild(toast);

  const duration = type === "info" && message.includes("解析中") ? 10000 : 4000;
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ============================================================
// メッセージリスナー
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "autoFill") {
    autoFillForm()
      .then(() => sendResponse({ status: "done" }))
      .catch(err => {
        console.error("[GForm AutoFill]", err);
        sendResponse({ status: "error", message: err.message });
      });
    return true;
  }
});
