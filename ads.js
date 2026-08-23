/* AdSense(自動広告)の読み込み。使い放題プラン加入者には広告を出さないため、
   スクリプトタグを静的に置かず、サブスク状態を確認できてから動的に読み込む。
   config.jsより後に読み込むこと。 */
(function () {
  var API_BASE = window.RAKUMO_API_BASE || "http://localhost:8000";
  var token = null;
  try { token = localStorage.getItem("rakumo_token"); } catch (e) {}
  var headers = token ? { "Authorization": "Bearer " + token } : {};

  fetch(API_BASE + "/api/download-status", { headers: headers })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.adsense_publisher_id) return; // サブスク中、または未設定
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + data.adsense_publisher_id;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
    })
    .catch(function () { /* 広告読み込み失敗はサイト機能に影響しないため無視 */ });
})();
