/* ローカル開発中はlocalhostのバックエンドに、公開後は本番バックエンドに
   自動的に向くようにする設定。各HTMLで、他のscriptより先に読み込む。 */
(function(){
  var isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  window.RAKUMO_API_BASE = isLocal
    ? "http://localhost:8000"
    : "https://rakumo-backend.onrender.com";
})();
