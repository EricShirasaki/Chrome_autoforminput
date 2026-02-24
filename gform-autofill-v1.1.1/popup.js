/**
 * GForm AutoFill - Popup Script
 * ポップアップウィンドウの表示制御と自動入力トリガー
 */

// 表示するプロフィール項目の定義（ラベル: キー）
const DISPLAY_FIELDS = [
  { key: "fullName",     label: "氏名" },
  { key: "lastName",     label: "姓" },
  { key: "firstName",    label: "名" },
  { key: "fullNameKana", label: "フリガナ" },
  { key: "phone",        label: "電話番号" },
  { key: "email",        label: "メール" },
  { key: "postalCode",   label: "郵便番号" },
  { key: "prefecture",   label: "都道府県" },
  { key: "organization", label: "所属" },
];

/**
 * プロフィールの概要をポップアップに表示する
 */
async function renderProfileSummary() {
  const result = await chrome.storage.sync.get(["profile", "openaiApiKey"]);
  const profile = result.profile;
  const container = document.getElementById("profileSummary");

  const apiKey = result.openaiApiKey;

  if (!apiKey || !apiKey.startsWith("sk-")) {
    container.innerHTML = '<div class="profile-empty" style="color:#dc3545;">⚠️ APIキーが未設定です<br><small>設定画面から登録してください</small></div>';
    return false;
  }

  if (!profile) {
    container.innerHTML = '<div class="profile-empty">プロフィールが未登録です</div>';
    return false;
  }

  const items = DISPLAY_FIELDS
    .filter(f => profile[f.key] && profile[f.key].trim() !== "")
    .slice(0, 5); // 最大5件表示

  if (items.length === 0) {
    container.innerHTML = '<div class="profile-empty">プロフィールが未登録です</div>';
    return false;
  }

  container.innerHTML = items.map(f => `
    <div class="profile-item">
      <span class="profile-item-label">${f.label}</span>
      <span class="profile-item-value">${escapeHtml(profile[f.key])}</span>
    </div>
  `).join("");

  return true;
}

/**
 * 現在のタブがGoogleフォームかどうかを確認する
 */
async function checkIsGoogleForm() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.url && tab.url.startsWith("https://docs.google.com/forms/");
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

/**
 * ステータスメッセージを表示する
 */
function showStatus(message, isError = false) {
  const el = document.getElementById("statusMsg");
  el.textContent = message;
  el.className = "status-msg" + (isError ? " error" : "");
  setTimeout(() => { el.textContent = ""; }, 3000);
}

// ============================================================
// 初期化処理
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  const btnAutoFill = document.getElementById("btnAutoFill");
  const btnSettings = document.getElementById("btnSettings");
  const warningBox  = document.getElementById("warningBox");

  // プロフィール概要を表示
  const hasProfile = await renderProfileSummary();

  // Googleフォームかどうかを確認
  const isGoogleForm = await checkIsGoogleForm();

  if (!isGoogleForm) {
    warningBox.style.display = "block";
    btnAutoFill.disabled = true;
  } else if (!hasProfile) {
    btnAutoFill.disabled = true;
  } else {
    btnAutoFill.disabled = false;
  }

  // 自動入力ボタンのクリックイベント
  btnAutoFill.addEventListener("click", async () => {
    btnAutoFill.disabled = true;
    btnAutoFill.innerHTML = "<span>⏳</span><span>入力中...</span>";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // content.js が読み込まれているか確認し、メッセージを送信
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });

      const response = await chrome.tabs.sendMessage(tab.id, { action: "autoFill" });

      if (response && response.status === "done") {
        showStatus("✓ 自動入力が完了しました");
      }
    } catch (err) {
      console.error("[GForm AutoFill Popup] エラー:", err);
      showStatus("エラーが発生しました。ページを再読み込みしてください。", true);
    } finally {
      btnAutoFill.disabled = false;
      btnAutoFill.innerHTML = "<span>⚡</span><span>ワンクリックで自動入力</span>";
    }
  });

  // 設定ページを開く
  btnSettings.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
