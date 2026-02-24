/**
 * GForm AutoFill v1.1.0 - Options Script
 * プロフィール設定画面のロジック（APIキー管理を含む）
 */

const PROFILE_KEYS = [
  "lastName", "firstName", "fullName",
  "lastNameKana", "firstNameKana", "fullNameKana",
  "phone", "email",
  "postalCode", "prefecture", "city", "addressLine", "fullAddress",
  "organization", "department",
  "age", "birthday", "gender"
];

// ============================================================
// トースト通知
// ============================================================
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast show${type !== "success" ? " " + type : ""}`;
  setTimeout(() => { toast.className = "toast"; }, 2500);
}

// ============================================================
// APIキー管理
// ============================================================

/**
 * APIキーのステータスバッジを更新する
 */
function updateApiStatus(key) {
  const el = document.getElementById("apiStatus");
  if (!key || key.trim() === "") {
    el.innerHTML = '<span class="api-status missing">⚠️ 未設定 — 自動入力は動作しません</span>';
  } else if (!key.startsWith("sk-")) {
    el.innerHTML = '<span class="api-status error">❌ 形式が正しくありません（"sk-" で始まる必要があります）</span>';
  } else {
    el.innerHTML = '<span class="api-status ok">✓ APIキーが設定されています</span>';
  }
}

// ============================================================
// プロフィール読み込み
// ============================================================
async function loadAll() {
  const result = await chrome.storage.sync.get(["profile", "openaiApiKey"]);
  const profile = result.profile || {};
  const apiKey  = result.openaiApiKey || "";

  // APIキー
  document.getElementById("openaiApiKey").value = apiKey;
  updateApiStatus(apiKey);

  // プロフィール
  PROFILE_KEYS.forEach(key => {
    const el = document.getElementById(key);
    if (el && profile[key]) el.value = profile[key];
  });
}

// ============================================================
// プロフィール収集
// ============================================================
function collectProfile() {
  const profile = {};
  PROFILE_KEYS.forEach(key => {
    const el = document.getElementById(key);
    if (el && el.value.trim() !== "") profile[key] = el.value.trim();
  });

  // 自動補完
  if (!profile.fullName && profile.lastName && profile.firstName) {
    profile.fullName = `${profile.lastName} ${profile.firstName}`;
  }
  if (!profile.fullNameKana && profile.lastNameKana && profile.firstNameKana) {
    profile.fullNameKana = `${profile.lastNameKana} ${profile.firstNameKana}`;
  }
  if (!profile.fullAddress) {
    const parts = [
      profile.postalCode ? `〒${profile.postalCode}` : "",
      profile.prefecture || "",
      profile.city || "",
      profile.addressLine || ""
    ].filter(Boolean);
    if (parts.length > 0) profile.fullAddress = parts.join(" ");
  }

  return profile;
}

// ============================================================
// エクスポート / インポート
// ============================================================
function exportData(profile, apiKey) {
  // セキュリティ上、APIキーはエクスポートに含めない
  const json = JSON.stringify(profile, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gform-autofill-profile.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importProfile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const sanitized = {};
      PROFILE_KEYS.forEach(key => {
        if (data[key] && typeof data[key] === "string") sanitized[key] = data[key];
      });
      await chrome.storage.sync.set({ profile: sanitized });
      PROFILE_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (el) el.value = sanitized[key] || "";
      });
      showToast("✓ プロフィールをインポートしました");
    } catch {
      showToast("JSONファイルの形式が正しくありません", "error");
    }
  };
  reader.readAsText(file);
}

// ============================================================
// イベントリスナー
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await loadAll();

  // APIキー入力時にリアルタイムでステータス更新
  document.getElementById("openaiApiKey").addEventListener("input", (e) => {
    updateApiStatus(e.target.value);
  });

  // APIキーの表示/非表示切替
  document.getElementById("btnToggleKey").addEventListener("click", () => {
    const input = document.getElementById("openaiApiKey");
    const btn   = document.getElementById("btnToggleKey");
    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "🙈";
    } else {
      input.type = "password";
      btn.textContent = "👁";
    }
  });

  // フォーム保存（プロフィール + APIキー）
  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const profile = collectProfile();
    const apiKey  = document.getElementById("openaiApiKey").value.trim();

    if (apiKey && !apiKey.startsWith("sk-")) {
      showToast("APIキーの形式が正しくありません", "error");
      return;
    }

    const saveData = { profile };
    if (apiKey) saveData.openaiApiKey = apiKey;

    await chrome.storage.sync.set(saveData);
    showToast("✓ 設定を保存しました");
    updateApiStatus(apiKey);
  });

  // データ消去
  document.getElementById("btnClear").addEventListener("click", async () => {
    if (!confirm("登録済みのプロフィールデータをすべて消去しますか？\n（APIキーは消去されません）")) return;
    await chrome.storage.sync.remove("profile");
    PROFILE_KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (el) el.value = "";
    });
    showToast("プロフィールデータを消去しました", "warning");
  });

  // エクスポート（APIキーは含めない）
  document.getElementById("btnExport").addEventListener("click", async () => {
    const result = await chrome.storage.sync.get("profile");
    if (!result.profile || Object.keys(result.profile).length === 0) {
      showToast("エクスポートするデータがありません", "error");
      return;
    }
    exportData(result.profile);
    showToast("✓ エクスポートしました（APIキーは含まれません）");
  });

  // インポート
  document.getElementById("btnImport").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) { importProfile(file); e.target.value = ""; }
  });
});
